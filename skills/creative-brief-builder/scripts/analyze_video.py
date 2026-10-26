#!/usr/bin/env python3
"""
Exact timing breakdown of an inspiration video, for the beat table.

Usage:
    python analyze_video.py <video> [--out DIR] [--threshold 0.3] [--no-asr]

Produces in DIR (default: ./video_analysis):
    report.md          shot list with exact cut times + the VO spoken in each shot
    shots.json         [{id, start, end, duration, frames: [...], vo: "..."}]
    transcript.json    ASR segments/words with timestamps (if ASR available)
    meta.json          duration, size, fps, audio present
    frames/            S01_a.jpg (just after the cut), S01_b.jpg (middle), S01_c.jpg (just before the next cut)
    hook/              frames every 0.25s for the first 3 seconds
    sheets/            contact sheets (several shots per image) for fast visual review

Needs ffmpeg + ffprobe. ASR uses faster-whisper or openai-whisper when installed;
otherwise the report says so and the VO must come from a transcript or captions.
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys


def run(cmd):
    return subprocess.run(cmd, capture_output=True, text=True)


def probe(path):
    r = run(["ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams", path])
    if r.returncode != 0:
        sys.exit(f"ffprobe failed: {r.stderr.strip()}")
    info = json.loads(r.stdout)
    v = next((s for s in info["streams"] if s.get("codec_type") == "video"), None)
    a = next((s for s in info["streams"] if s.get("codec_type") == "audio"), None)
    if v is None:
        sys.exit("No video stream found.")
    num, den = (v.get("avg_frame_rate") or "0/1").split("/")
    fps = float(num) / float(den) if float(den) else 0.0
    duration = float(info["format"].get("duration") or v.get("duration") or 0)
    w, h = int(v["width"]), int(v["height"])
    rot = 0
    for sd in v.get("side_data_list", []) or []:
        if "rotation" in sd:
            rot = abs(int(sd["rotation"]))
    if rot in (90, 270):
        w, h = h, w
    return {
        "duration": round(duration, 3),
        "width": w,
        "height": h,
        "aspect_ratio": aspect(w, h),
        "fps": round(fps, 3),
        "has_audio": a is not None,
    }


def aspect(w, h):
    for name, r in (("9:16", 9 / 16), ("4:5", 4 / 5), ("1:1", 1.0), ("16:9", 16 / 9), ("2:3", 2 / 3), ("3:4", 3 / 4)):
        if abs(w / h - r) < 0.02:
            return name
    return f"{w}:{h}"


def detect_cuts(path, threshold):
    """Return sorted cut times (seconds) where a new shot starts, using ffmpeg scene scores."""
    r = run([
        "ffmpeg", "-hide_banner", "-nostats", "-i", path,
        "-filter:v", f"select='gt(scene,{threshold})',showinfo", "-an", "-f", "null", "-",
    ])
    times = [float(m) for m in re.findall(r"pts_time:([0-9.]+)", r.stderr)]
    cuts = []
    for t in sorted(times):
        if t < 0.2:
            continue
        # merge flashes / double detections closer than 0.2s
        if cuts and t - cuts[-1] < 0.2:
            continue
        cuts.append(round(t, 3))
    return cuts


def grab(path, t, dest, width=540):
    run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-ss", f"{max(t, 0):.3f}", "-i", path,
        "-frames:v", "1", "-vf", f"scale={width}:-2", "-q:v", "3", dest,
    ])
    return os.path.exists(dest)


def contact_sheets(images, labels, out_dir, per_sheet=8, cols=4):
    try:
        from PIL import Image, ImageDraw
    except ImportError:
        return []
    sheets = []
    for start in range(0, len(images), per_sheet):
        chunk = images[start:start + per_sheet]
        tiles = [Image.open(p).convert("RGB") for p in chunk]
        tw = 270
        th = int(tiles[0].height * tw / tiles[0].width)
        tiles = [t.resize((tw, th)) for t in tiles]
        rows = (len(tiles) + cols - 1) // cols
        sheet = Image.new("RGB", (cols * tw, rows * (th + 22)), "white")
        draw = ImageDraw.Draw(sheet)
        for i, tile in enumerate(tiles):
            x, y = (i % cols) * tw, (i // cols) * (th + 22)
            sheet.paste(tile, (x, y + 22))
            draw.text((x + 4, y + 4), labels[start + i], fill="black")
        dest = os.path.join(out_dir, f"sheet_{start // per_sheet + 1:02d}.jpg")
        sheet.save(dest, quality=85)
        sheets.append(dest)
    return sheets


def transcribe(path, out_dir):
    """Try faster-whisper, then openai-whisper. Returns (engine, segments) or (None, reason)."""
    wav = os.path.join(out_dir, "audio.wav")
    run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", path, "-ac", "1", "-ar", "16000", wav])
    if not os.path.exists(wav):
        return None, "could not extract audio"
    try:
        from faster_whisper import WhisperModel
        model = WhisperModel(os.environ.get("WHISPER_MODEL", "small"), compute_type="int8")
        segs, _ = model.transcribe(wav, word_timestamps=True)
        out = []
        for s in segs:
            out.append({
                "start": round(s.start, 3), "end": round(s.end, 3), "text": s.text.strip(),
                "words": [{"start": round(w.start, 3), "end": round(w.end, 3), "word": w.word.strip()} for w in (s.words or [])],
            })
        return "faster-whisper", out
    except ImportError:
        pass
    except Exception as e:  # model download blocked, etc.
        return None, f"faster-whisper failed: {e}"
    try:
        import whisper
        model = whisper.load_model(os.environ.get("WHISPER_MODEL", "small"))
        res = model.transcribe(wav, word_timestamps=True)
        out = []
        for s in res["segments"]:
            out.append({
                "start": round(s["start"], 3), "end": round(s["end"], 3), "text": s["text"].strip(),
                "words": [{"start": round(w["start"], 3), "end": round(w["end"], 3), "word": w["word"].strip()} for w in s.get("words", [])],
            })
        return "openai-whisper", out
    except ImportError:
        return None, "no ASR installed (try: pip install faster-whisper)"
    except Exception as e:
        return None, f"whisper failed: {e}"


def words_in(segments, start, end):
    """VO words whose midpoint falls inside [start, end)."""
    words = []
    for s in segments:
        if s.get("words"):
            for w in s["words"]:
                mid = (w["start"] + w["end"]) / 2
                if start <= mid < end:
                    words.append(w["word"])
        else:
            mid = (s["start"] + s["end"]) / 2
            if start <= mid < end:
                words.append(s["text"])
    return " ".join(words).strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("--out", default="video_analysis")
    ap.add_argument("--threshold", type=float, default=0.3,
                    help="scene-change sensitivity; lower (0.2) for soft cuts/animation, higher (0.4) for shaky UGC")
    ap.add_argument("--no-asr", action="store_true")
    args = ap.parse_args()

    for tool in ("ffmpeg", "ffprobe"):
        if not shutil.which(tool):
            sys.exit(f"{tool} not found. Fall back to frames/screenshots + transcript, and mark timings as estimated.")

    out = args.out
    for d in ("frames", "hook", "sheets"):
        os.makedirs(os.path.join(out, d), exist_ok=True)

    meta = probe(args.video)
    cuts = detect_cuts(args.video, args.threshold)
    bounds = [0.0] + cuts + [meta["duration"]]
    shots = []
    for i in range(len(bounds) - 1):
        start, end = bounds[i], bounds[i + 1]
        if end - start <= 0:
            continue
        sid = f"S{len(shots) + 1:02d}"
        pts = {"a": start + min(0.08, (end - start) / 4), "b": (start + end) / 2, "c": max(start, end - 0.08)}
        frames = []
        for k, t in pts.items():
            dest = os.path.join(out, "frames", f"{sid}_{k}.jpg")
            if grab(args.video, t, dest):
                frames.append(dest)
        shots.append({"id": sid, "start": round(start, 3), "end": round(end, 3),
                      "duration": round(end - start, 3), "frames": frames})

    hook_frames = []
    t = 0.0
    while t < min(3.0, meta["duration"]):
        dest = os.path.join(out, "hook", f"hook_{t:05.2f}s.jpg")
        if grab(args.video, t, dest):
            hook_frames.append(dest)
        t = round(t + 0.25, 2)

    mids = [s["frames"][1] if len(s["frames"]) > 1 else s["frames"][0] for s in shots if s["frames"]]
    labels = [f'{s["id"]} {s["start"]:.3f}-{s["end"]:.3f}' for s in shots if s["frames"]]
    sheets = contact_sheets(mids, labels, os.path.join(out, "sheets"))

    asr_engine, segments = None, []
    asr_note = "skipped (--no-asr)"
    if meta["has_audio"] and not args.no_asr:
        asr_engine, res = transcribe(args.video, out)
        if asr_engine:
            segments = res
            asr_note = f"{asr_engine}, word timestamps"
        else:
            asr_note = res
    elif not meta["has_audio"]:
        asr_note = "video has no audio track"
    for s in shots:
        s["vo"] = words_in(segments, s["start"], s["end"]) if segments else ""

    json.dump(meta, open(os.path.join(out, "meta.json"), "w"), indent=2)
    json.dump(shots, open(os.path.join(out, "shots.json"), "w"), indent=2)
    if segments:
        json.dump(segments, open(os.path.join(out, "transcript.json"), "w"), indent=2)

    lines = [
        f"# Video analysis: {os.path.basename(args.video)}",
        "",
        f"- Duration: {meta['duration']:.3f}s · {meta['width']}x{meta['height']} ({meta['aspect_ratio']}) · {meta['fps']} fps · audio: {'yes' if meta['has_audio'] else 'no'}",
        f"- Shots: {len(shots)} (scene threshold {args.threshold}; cut times are frame-accurate from ffmpeg)",
        f"- Average shot: {meta['duration'] / max(len(shots), 1):.2f}s",
        f"- ASR: {asr_note}",
        f"- Contact sheets: {', '.join(sheets) if sheets else 'not created (PIL missing)'}",
        f"- Hook frames (every 0.25s, first 3s): {len(hook_frames)} in {os.path.join(out, 'hook')}",
        "",
        "| Shot | Start–end (s) | Dur (s) | VO in this shot (ASR) | Frames |",
        "|---|---|---|---|---|",
    ]
    for s in shots:
        lines.append(f"| {s['id']} | {s['start']:.3f}–{s['end']:.3f} | {s['duration']:.3f} | {s['vo'] or '—'} | "
                     f"{', '.join(os.path.basename(f) for f in s['frames'])} |")
    if segments:
        lines += ["", "## Transcript (ASR, timestamps in seconds)", ""]
        lines += [f"- {seg['start']:.3f}–{seg['end']:.3f}: {seg['text']}" for seg in segments]
    lines += [
        "",
        "## Next",
        "Look at every contact sheet and the hook frames, read on-screen text from the frames, then group shots into beats",
        "(B01…). Beat boundaries must sit on these cut times or on VO timestamps. If shot count looks wrong",
        "(missed soft cuts / too many cuts on shaky footage), re-run with --threshold 0.2 or 0.4.",
    ]
    open(os.path.join(out, "report.md"), "w").write("\n".join(lines) + "\n")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
