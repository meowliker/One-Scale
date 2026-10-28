# V1 video build — status

**Current: v1.1 draft** — `video/KMH-V1-INS-20785b5fa6bd-v1.1-draft.mp4` (61.20 s). New female VO (Kie Gemini 3.1 Flash TTS, voice Sulafat), new end shot S28 with the exact ASSET02 cover, no freeze frame. Details in `storyboard-package.md` §16; VO tasks in `kie-audio-tasks.json`, S28 task in `kie-video-tasks.json`. The v1.0 draft (63.15 s) and its files are kept (§15).

To rebuild from a fresh checkout (needs network access to `api.kie.ai`, `tempfile.aiquickdraw.com` and `d8j0ntlcm91z4.cloudfront.net`; ffmpeg, Pillow, numpy, opencv-python-headless):

1. `bash build_assets.sh` — downloads keyframes, voiceovers and the character reference, builds previews and audio mixes.
2. The clips used are in `video/` (`selected_file` in `kie-video-tasks.json`). If any is missing, re-fetch it with `GET https://api.kie.ai/api/v1/jobs/recordInfo?taskId=<id>`.
3. `python3 build_s28.py track` — pins the exact cover onto `video/VID-S28-01.mp4` → `video/VID-S28-01-cover.mp4` (`build_s28.py start` remakes the S28 start frame; the committed one is the exact file sent to Kie).
4. `python3 build_video.py` — v1.1 (`python3 build_video.py v1.0` rebuilds v1.0): times each shot to its VO line, cuts, adds headline/captions, mixes VO + bed, exports the draft, its timeline JSON and the contact sheet.
5. `python3 make_pdf.py storyboard-package.md` — package PDF (Markdown → HTML → Chromium).

Still open:

- **Length:** 61.20 s vs the ≤ ~58 s target. Pauses are trimmed and the VO is not sped up. Options: re-voice on Kie ElevenLabs at speed ≈1.1 when its TTS works again (all calls failed server-side on 2026-10-26), approve a ~×1.06 tempo on this read, or accept 61 s.
- S27 shows the blank placeholder book for 0.6 s while it is raised.
- Licensed music to replace the preview bed; strategist approval.
