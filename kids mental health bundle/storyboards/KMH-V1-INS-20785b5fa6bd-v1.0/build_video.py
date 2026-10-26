"""Builds the V1 draft video from the Kie clips, the V1 voiceover and the music bed.

Picture is re-timed to the VO: each shot runs from the pause before its VO line to the
pause before the next line (hard cuts, 720x1280, 30 fps). Each clip plays from its start;
a clip shorter than its shot is slowed just enough to fill it (blended frames).
VO: never sped up; pauses between lines capped at MAX_GAP, pauses inside a line kept.
The headline sits over S01. Captions follow the VO using audio/AUD-V1-VO-words.json (Whisper
word timestamps of AUD-V1-VO.mp3, 171 words = the 171-word script).
Needs: ffmpeg, python3 + Pillow.   Run:  python3 build_video.py
"""
import json, os, re, subprocess, sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

os.chdir(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, "prompts")
from shots import SHOTS  # noqa: E402

W, H, FPS = 720, 1280, 30
MAX_GAP = 0.35
BED_DB = -18
VO = "audio/AUD-V1-VO.mp3"
BED = "audio/KMH-V1-v1.0-music-bed-preview.mp3"
OUT = "video/KMH-V1-INS-20785b5fa6bd-v1.0-draft.mp4"
TIMELINE = "video/KMH-V1-INS-20785b5fa6bd-v1.0-draft-timeline.json"
WORK = os.environ.get("BUILD_TMP", "video/_build")
SANS = "/usr/share/fonts/opentype/inter/Inter-Bold.otf"
SERIF = "/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf"
CAP = "/usr/share/fonts/truetype/liberation/LiberationSerif-BoldItalic.ttf"
GOLD = (0xF2, 0xC1, 0x4E, 255)
os.makedirs(WORK, exist_ok=True)


def run(*a):
    subprocess.run(a, check=True)


# ---------- alignment ----------
words = json.load(open("audio/AUD-V1-VO-words.json"))
err = subprocess.run(["ffmpeg", "-hide_banner", "-i", VO, "-af", "silencedetect=noise=-35dB:d=0.15", "-f", "null", "-"],
                     capture_output=True, text=True).stderr
sil = list(zip([float(x) for x in re.findall(r"silence_start: ([\d.]+)", err)],
               [float(x) for x in re.findall(r"silence_end: ([\d.]+)", err)]))
md = open("storyboard-package.md").read()
caps = {m.group(1): [g.strip() for g in m.group(2).split(" / ")]
        for m in re.finditer(r"^- (S\d\d): (.+)$", md.split("**Caption states")[1].split("---")[0], re.M)}

script = []
for s in SHOTS:
    assert s[5].split() == " ".join(caps[s[0]]).split(), s[0]
    script += s[5].split()
assert len(script) == len(words) == 171


def silence_between(i):
    for s0, s1 in sil:
        if words[i - 1][1] + 0.05 <= s0 <= words[i][1] + 0.1:
            return s0, s1
    return None


lines, idx = [], 0
for s in SHOTS:
    n = len(s[5].split())
    lines.append({"shot": s[0], "shot_start": s[1], "shot_end": s[2], "text": s[5], "w0": idx, "w1": idx + n - 1})
    idx += n
for i, L in enumerate(lines):
    if i == 0:
        L["src_on"], L["pause_before"] = (sil[0][1] if sil[0][0] < 0.05 else words[0][1]), 0.0
        continue
    g = silence_between(L["w0"])
    L["src_on"] = g[1] if g else words[L["w0"]][1]
    L["pause_before"] = round(g[1] - g[0], 3) if g else 0.0
    lines[i - 1]["src_off"] = g[0] if g else words[L["w0"]][1]
lines[-1]["src_off"] = [s0 for s0, _ in sil if s0 > words[-1][1] - 0.3][0]

prev_end = 0.0
for i, L in enumerate(lines):
    t = L["src_on"] if i == 0 else prev_end + min(L["pause_before"], MAX_GAP)
    L["out_on"] = round(t, 3)
    L["shift"] = round(t - L["src_on"], 3)
    L["out_off"] = round(t + L["src_off"] - L["src_on"], 3)
    prev_end = L["out_off"]
final_end = round(lines[-1]["out_off"] + 0.8, 3)
# shot cuts: midpoint of the pause before each line (or the word boundary if there is none)
cut = [0.0] + [round((lines[i - 1]["out_off"] + lines[i]["out_on"]) / 2, 3) for i in range(1, len(lines))] + [final_end]
for i, L in enumerate(lines):
    L["cut_start"], L["cut_end"] = cut[i], cut[i + 1]

captions = []
for L in lines:
    gi = L["w0"]
    for g in caps[L["shot"]]:
        n = len(g.split())
        start = L["out_on"] if gi == L["w0"] else max(words[gi][1] + L["shift"], L["out_on"])
        captions.append({"shot": L["shot"], "text": g, "start": round(start, 3),
                         "word_end": round(words[gi + n - 1][2] + L["shift"], 3)})
        gi += n
for i, c in enumerate(captions):
    nxt = captions[i + 1]["start"] if i + 1 < len(captions) else None
    end = c["word_end"] + 0.5
    if nxt is not None:
        end = min(end, nxt)
        if nxt - end < 0.25:
            end = nxt
    c["end"] = round(min(end, final_end), 3)

# ---------- clips ----------
tasks = json.load(open("kie-video-tasks.json"))
shots_out = []
for s in SHOTS:
    clip = tasks["clips"][f"VID-{s[0]}-01"]
    f = f"video/VID-{s[0]}-01.mp4"
    for r in clip.get("retries", []):
        if r.get("state") == "success" and r.get("qc") == "pass":
            f = r["file"]
    clip["selected_file"] = f
    L = lines[len(shots_out)]
    clip_len = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                                              "-of", "csv=p=0", f]))
    need = L["cut_end"] - L["cut_start"]
    shots_out.append({"shot": s[0], "file": f, "planned_start": s[1], "planned_end": s[2],
                      "start": L["cut_start"], "end": L["cut_end"], "clip_s": round(clip_len, 3),
                      "slow": round(max(1.0, need / (clip_len - 0.05)), 3),
                      "frames": round(L["cut_end"] * FPS) - round(L["cut_start"] * FPS)})
json.dump(tasks, open("kie-video-tasks.json", "w"), indent=1)


# ---------- overlays ----------
def soft_shadow_text(img, xy, text, font, fill, blur=4, offset=(2, 3), alpha=170):
    sh = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(sh).text((xy[0] + offset[0], xy[1] + offset[1]), text, font=font, fill=(0, 0, 0, alpha))
    sh = sh.filter(ImageFilter.GaussianBlur(blur))
    img.alpha_composite(sh)
    ImageDraw.Draw(img).text(xy, text, font=font, fill=fill)


def fit_font(path, size, texts, max_w):
    while True:
        f = ImageFont.truetype(path, size)
        if sum(f.getlength(t) for t in texts) <= max_w or size <= 20:
            return f
        size -= 2


blank = Image.new("RGBA", (W, H), (0, 0, 0, 0))
blank.save(f"{WORK}/blank.png")

# headline: "Kid Always" white bold sans + "DYSREGULATED?" gold bold serif caps, top ~8%
hl = blank.copy()
fa = ImageFont.truetype(SANS, 40)
fb = fit_font(SERIF, 46, ["DYSREGULATED?"], W - 80 - fa.getlength("Kid Always ") - 14)
wa, wb, gap = fa.getlength("Kid Always"), fb.getlength("DYSREGULATED?"), 14
x0 = (W - (wa + gap + wb)) / 2
yc = H * 0.08
ba, bb = fa.getbbox("Kid Always"), fb.getbbox("DYSREGULATED?")
soft_shadow_text(hl, (x0, yc - (ba[1] + ba[3]) / 2), "Kid Always", fa, (255, 255, 255, 255))
soft_shadow_text(hl, (x0 + wa + gap, yc - (bb[1] + bb[3]) / 2), "DYSREGULATED?", fb, GOLD)
hl.save(f"{WORK}/headline.png")

for i, c in enumerate(captions):
    im = blank.copy()
    f = fit_font(CAP, 54, [c["text"]], W - 80)
    bx = f.getbbox(c["text"])
    soft_shadow_text(im, ((W - (bx[2] - bx[0])) / 2 - bx[0], H * 0.74 - (bx[1] + bx[3]) / 2), c["text"], f,
                     (255, 255, 255, 255), blur=5, offset=(2, 3), alpha=200)
    c["png"] = f"{WORK}/cap_{i:03d}.png"
    im.save(c["png"])

HL_END = shots_out[0]["end"]
# image-sequence overlay track: headline over S01, captions per timing, blank elsewhere
with open(f"{WORK}/overlay.txt", "w") as fh:
    t = 0.0
    seq = []
    # headline and S01 captions overlap: composite them
    for i, c in enumerate(captions):
        if c["start"] < HL_END:
            im = Image.open(c["png"]).copy()
            im.alpha_composite(hl)
            c["png"] = f"{WORK}/cap_{i:03d}_hl.png"
            im.save(c["png"])
    cuts = sorted({0.0, HL_END, final_end} | {c["start"] for c in captions} | {c["end"] for c in captions})
    for a, b in zip(cuts, cuts[1:]):
        if b - a <= 0:
            continue
        mid = (a + b) / 2
        cur = next((c["png"] for c in captions if c["start"] <= mid < c["end"]), None)
        if cur is None:
            cur = f"{WORK}/headline.png" if mid < HL_END else f"{WORK}/blank.png"
        seq.append((cur, b - a))
    for p, d in seq:
        fh.write(f"file '{os.path.abspath(p)}'\nduration {d:.4f}\n")
    fh.write(f"file '{os.path.abspath(seq[-1][0])}'\n")

# ---------- render ----------
args = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y"]
for s in shots_out:
    args += ["-i", s["file"]]
n = len(shots_out)
args += ["-f", "concat", "-safe", "0", "-i", f"{WORK}/overlay.txt", "-i", VO, "-i", BED]
fc = []
for i, s in enumerate(shots_out):
    speed = f"setpts={s['slow']}*PTS,framerate=fps={FPS}" if s["slow"] > 1 else f"fps={FPS}"
    fc.append(f"[{i}:v]{speed},scale={W}:{H},setsar=1,tpad=stop_mode=clone:stop_duration=1,"
              f"trim=end_frame={s['frames']},setpts=PTS-STARTPTS[v{i}]")
fc.append("".join(f"[v{i}]" for i in range(n)) + f"concat=n={n}:v=1:a=0[base]")
fc.append(f"[{n}:v]fps={FPS},format=rgba,setpts=PTS-STARTPTS[ov]")
fc.append(f"[base][ov]overlay=0:0:eof_action=pass:format=auto,format=yuv420p,trim=end={final_end}[vout]")
# VO pieces
vo_idx, bed_idx = n + 1, n + 2
fc.append(f"[{vo_idx}:a]asplit={n}" + "".join(f"[s{i}]" for i in range(n)))
for i, L in enumerate(lines):
    pre = 0.03 if L["pause_before"] > 0 else 0.0
    post = 0.05 if i + 1 < n and lines[i + 1]["pause_before"] > 0 else (0.3 if i + 1 == n else 0.0)
    a0, a1 = L["src_on"] - pre, L["src_off"] + post
    delay = int(round((L["out_on"] - pre) * 1000))
    fc.append(f"[s{i}]atrim={a0:.3f}:{a1:.3f},asetpts=PTS-STARTPTS,adelay={delay}|{delay}[p{i}]")
fc.append("".join(f"[p{i}]" for i in range(n)) + f"amix=inputs={n}:normalize=0:duration=longest[vo]")
# bed: original + crossfaded repeat of its brighter second half, -18 dB, fade out
fc.append(f"[{bed_idx}:a]asplit=2[b1][b2];[b2]atrim=34:55.2,asetpts=PTS-STARTPTS[b2t];"
          f"[b1][b2t]acrossfade=d=2:c1=tri:c2=tri,volume={BED_DB}dB,atrim=0:{final_end},"
          f"afade=t=out:st={final_end - 1.5:.3f}:d=1.5[bed]")
fc.append(f"[vo][bed]amix=inputs=2:normalize=0:duration=first,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=44100,"
          f"apad=whole_dur={final_end},atrim=0:{final_end}[aout]")
open(f"{WORK}/filter.txt", "w").write(";\n".join(fc))
args += ["-filter_complex_script", f"{WORK}/filter.txt", "-map", "[vout]", "-map", "[aout]",
         "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-r", str(FPS),
         "-c:a", "aac", "-b:a", "160k", "-ar", "44100", "-movflags", "+faststart", OUT]
run(*args)

json.dump({"fps": FPS, "size": [W, H], "planned_end": SHOTS[-1][2], "final_end": final_end, "max_gap_s": MAX_GAP,
           "bed_db": BED_DB, "shots": shots_out,
           "vo_lines": [{k: L[k] for k in ("shot", "text", "cut_start", "cut_end", "out_on", "out_off",
                                            "src_on", "src_off")} for L in lines],
           "captions": [{k: c[k] for k in ("shot", "text", "start", "end")} for c in captions]},
          open(TIMELINE, "w"), indent=1)
print("wrote", OUT, "final_end", final_end)
