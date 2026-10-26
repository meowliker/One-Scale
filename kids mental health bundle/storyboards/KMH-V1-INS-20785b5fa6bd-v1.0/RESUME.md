# V1 video build — status

The V1 draft is built: `video/KMH-V1-INS-20785b5fa6bd-v1.0-draft.mp4` (63.15 s). All 28 keyframes and 27 Kie clips were inspected; 12 clips were redone once on Kie and passed (details in `storyboard-package.md` §15 and `kie-video-tasks.json`).

To rebuild from a fresh checkout (needs network access to `api.kie.ai`, `tempfile.aiquickdraw.com` and `d8j0ntlcm91z4.cloudfront.net`):

1. `bash build_assets.sh` — downloads keyframes, voiceovers and the character reference, builds previews and audio mixes.
2. The 27 clips used are in `video/` (`selected_file` in `kie-video-tasks.json`). If any is missing, re-fetch it with `GET https://api.kie.ai/api/v1/jobs/recordInfo?taskId=<id>`.
3. `python3 build_video.py` — trims, cuts, adds headline/captions, mixes VO + bed, exports the draft and its timeline JSON.

Still open:

- **VO overrun:** the stock VO is ~70 s of speech at natural pace vs the 55.055 s edit. Decide: faster re-record, shorter script (v1.1), or re-time the picture.
- **Real bundle cover (ASSET02)** to replace the placeholder book on S27.
- Licensed music to replace the preview bed; strategist approval.
