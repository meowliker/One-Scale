"""Builds KF-S28-01 (S28 start frame): the last frame of VID-S27-01 with the exact ASSET02 cover
perspective-warped onto the placeholder book, mom's fingers pasted back over the spine.
Run:  python3 build_s28_start.py <S27 last frame.png> assets/ASSET02-kmh-bundle-cover.png assets/KF-S28-01-start-frame.png
(last frame:  ffmpeg -sseof -0.05 -i video/VID-S27-01.mp4 -frames:v 1 s27_last.png)"""

import numpy as np, sys
from PIL import Image, ImageDraw, ImageFilter
frame = Image.open(sys.argv[1]).convert("RGBA")
cover = Image.open(sys.argv[2]).convert("RGBA")
bx0, by0, bx1, by1 = cover.getbbox()
cover = cover.crop((bx0, by0, bx1, by1))
# placeholder quad (TL, TR, BR, BL) in frame px, scaled up 10% about its centre to hide the placeholder edges
q = np.array([(61, 325), (177, 301), (215, 467), (97, 492)], float)
c = q.mean(0); q = c + (q - c) * float(sys.argv[4] if len(sys.argv) > 4 else 1.10)
def coeffs(dst, src):
    A = []
    for (x, y), (u, v) in zip(dst, src):
        A += [[x, y, 1, 0, 0, 0, -u * x, -u * y], [0, 0, 0, x, y, 1, -v * x, -v * y]]
    return np.linalg.solve(np.array(A), np.array(src).reshape(8))
w, h = cover.size
src = [(0, 0), (w, 0), (w, h), (0, h)]
warped = cover.transform(frame.size, Image.PERSPECTIVE, tuple(coeffs(q, src)), Image.BICUBIC)
# soft contact shadow
sh = Image.new("RGBA", frame.size, (0, 0, 0, 0))
sh.putalpha(warped.split()[3].point(lambda a: int(a * 0.35)))
sh = sh.filter(ImageFilter.GaussianBlur(6))
out = frame.copy(); out.alpha_composite(sh, (3, 4)); out.alpha_composite(warped)
# fingers over the spine: polygon from the original frame
hand = Image.new("L", frame.size, 0)
ImageDraw.Draw(hand).polygon([(64, 404), (92, 398), (110, 404), (121, 418), (119, 438), (112, 455), (98, 466),
                              (86, 472), (78, 462), (68, 448), (64, 430)], fill=255)
hand = hand.filter(ImageFilter.GaussianBlur(1.2))
out.paste(frame, (0, 0), hand)
out.convert("RGB").save(sys.argv[3])
