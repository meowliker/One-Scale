"""S28 (end book shot) with the exact ASSET02 cover.

  python3 build_s28.py start   ->  assets/KF-S28-01-start-frame.png
      last frame of VID-S27-01 with the real cover perspective-warped onto the placeholder book
      (10% larger, so the placeholder edges are hidden) and mom's fingers pasted back over the spine.
      The committed file is the exact image sent to Kie Grok for VID-S28-01 (see kie-video-tasks.json);
      a rerun matches it to within a few pixels at the shadow edge.
  python3 build_s28.py track   ->  video/VID-S28-01-cover.mp4
      Grok redraws the cover text, so the exact cover is pinned back onto the book in every frame of
      VID-S28-01: SIFT features on the book -> RANSAC homography per frame -> corner tracks smoothed over
      5 frames -> cover warped on top, fingers from the Grok frame kept on top.
Needs: ffmpeg, python3 + numpy, Pillow, opencv-python-headless.
"""
import glob, os, subprocess, sys, tempfile

import cv2
import numpy as np

os.chdir(os.path.dirname(os.path.abspath(__file__)))
COVER = "assets/ASSET02-kmh-bundle-cover.png"
START = "assets/KF-S28-01-start-frame.png"
QUAD = np.array([(61, 325), (177, 301), (215, 467), (97, 492)], float)  # placeholder book TL, TR, BR, BL
QUAD = np.float32(QUAD.mean(0) + (QUAD - QUAD.mean(0)) * 1.10)
HAND = np.float32([(64, 404), (92, 398), (110, 404), (121, 418), (119, 438), (112, 455), (98, 466),
                   (86, 472), (78, 462), (68, 448), (64, 430)])


def load_cover():
    c = cv2.imread(COVER, cv2.IMREAD_UNCHANGED)
    ys, xs = np.where(c[:, :, 3] > 0)
    c = c[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    h, w = c.shape[:2]
    return c, np.float32([(0, 0), (w, 0), (w, h), (0, h)])


def composite(frame, quad, hand_src, shadow=False):
    cover, src = load_cover()
    lay = cv2.warpPerspective(cover, cv2.getPerspectiveTransform(src, quad), frame.shape[1::-1],
                              flags=cv2.INTER_CUBIC).astype(np.float32)
    a = lay[:, :, 3:4] / 255.0
    out = frame.astype(np.float32)
    if shadow:  # soft contact shadow, offset (3, 4)
        s = np.roll(cv2.GaussianBlur(a[:, :, 0], (0, 0), 6), (4, 3), (0, 1))[:, :, None] * 0.35
        out = out * (1 - s)
    out = out * (1 - a) + lay[:, :, :3] * a
    hp = cv2.perspectiveTransform(HAND.reshape(-1, 1, 2), cv2.getPerspectiveTransform(QUAD, quad)).reshape(-1, 2)
    m = np.zeros(frame.shape[:2], np.float32)
    cv2.fillPoly(m, [hp.astype(np.int32)], 1.0)
    m = cv2.GaussianBlur(m, (0, 0), 1.2)[:, :, None]
    return (out * (1 - m) + hand_src.astype(np.float32) * m).clip(0, 255).astype(np.uint8)


def start():
    with tempfile.TemporaryDirectory() as d:
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-sseof", "-0.05", "-i", "video/VID-S27-01.mp4",
                        "-frames:v", "1", f"{d}/last.png"], check=True)
        fr = cv2.imread(f"{d}/last.png")
    cv2.imwrite(START, composite(fr, QUAD, fr, shadow=True))


def track(src_clip="video/VID-S28-01.mp4", out="video/VID-S28-01-cover.mp4"):
    st = cv2.imread(START)
    mask = np.zeros(st.shape[:2], np.uint8)
    cv2.fillConvexPoly(mask, QUAD.astype(np.int32), 255)
    sift = cv2.SIFT_create(2000)
    k0, d0 = sift.detectAndCompute(cv2.cvtColor(st, cv2.COLOR_BGR2GRAY), mask)
    search = cv2.dilate(mask, np.ones((61, 61), np.uint8))
    with tempfile.TemporaryDirectory() as d:
        subprocess.run(["ffmpeg", "-v", "error", "-i", src_clip, f"{d}/%03d.png"], check=True)
        files = sorted(glob.glob(f"{d}/*.png"))
        frames = [cv2.imread(f) for f in files]
        corners = []
        for fr in frames:
            k1, d1 = sift.detectAndCompute(cv2.cvtColor(fr, cv2.COLOR_BGR2GRAY), search)
            good = [a for a, b in cv2.BFMatcher().knnMatch(d0, d1, k=2) if a.distance < 0.75 * b.distance]
            H, inl = cv2.findHomography(np.float32([k0[g.queryIdx].pt for g in good]),
                                        np.float32([k1[g.trainIdx].pt for g in good]), cv2.RANSAC, 3.0)
            assert inl.sum() >= 40, f"tracking lost ({int(inl.sum())} inliers)"
            corners.append(cv2.perspectiveTransform(QUAD.reshape(-1, 1, 2), H).reshape(4, 2))
        cv_ = np.pad(np.array(corners), ((2, 2), (0, 0), (0, 0)), mode="edge")
        smooth = [cv_[i:i + 5].mean(0) for i in range(len(corners))]
        for f, fr, q in zip(files, frames, smooth):
            cv2.imwrite(f, composite(fr, np.float32(q), fr))
        fps = subprocess.check_output(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                                       "stream=r_frame_rate", "-of", "csv=p=0", src_clip], text=True).strip()
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-framerate", fps, "-i", f"{d}/%03d.png", "-c:v", "libx264",
                        "-crf", "14", "-pix_fmt", "yuv420p", out], check=True)
    print("wrote", out, len(files), "frames")


{"start": start, "track": track}[sys.argv[1]]()
