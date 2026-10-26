# Resume the V1 video build

All 27 Grok Video 1.5 clips (720p, 9:16) are generated on Kie.ai. Their task IDs and result links are in `kie-video-tasks.json`.

To finish, a session with network access to `api.kie.ai`, `tempfile.aiquickdraw.com` and `d8j0ntlcm91z4.cloudfront.net` should:

1. Re-check each Kie task with `GET https://api.kie.ai/api/v1/jobs/recordInfo?taskId=<id>`, fill in any missing `result_url`, and download every clip to `video/`.
2. Run `bash build_assets.sh` to download the frames, voiceovers and character reference, build the layout previews and mixed audio, and make the contact sheet.
3. Inspect each clip against its keyframe. Regenerate failures on Kie only (the user asked for Kie.ai only).
4. Trim each clip to its edit duration in `prompts/shots.py` and join them in shot order (55.055 s total).
5. Add the S01 headline, the word-by-word captions, the V1 voiceover and the music bed. Composite the real bundle cover on S27 once it's supplied.
6. Export `video/KMH-V1-INS-20785b5fa6bd-v1.0-draft.mp4`, then update `storyboard-package.md`/`.pdf` and the approval record.
