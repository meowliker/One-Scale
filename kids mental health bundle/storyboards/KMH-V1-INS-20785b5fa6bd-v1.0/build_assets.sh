#!/usr/bin/env bash
# Downloads the Higgsfield renders listed in asset-sources.json, then builds the
# layout previews, mixed audio previews and contact sheet for this package.
# Needs: curl, ffmpeg, python3. Run from anywhere:  bash build_assets.sh
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p keyframes audio previews
python3 - <<'PY'
import json, subprocess, os
for k, v in json.load(open("asset-sources.json")).items():
    ext = "mp3" if k.startswith("AUD") else "png"
    d = "audio" if ext == "mp3" else ("assets" if k.startswith("ASSET") else "keyframes")
    os.makedirs(d, exist_ok=True)
    out = f"{d}/{k}.{ext}"
    if not os.path.exists(out):
        subprocess.run(["curl", "-sSfL", "-o", out, v["url"]], check=True)
    print("ok", out)
PY
SANS=$(fc-match -f '%{file}' 'Inter:style=Bold' 2>/dev/null || echo /usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf)
SERIF=$(fc-match -f '%{file}' 'Liberation Serif:style=Bold' 2>/dev/null || echo /usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf)
CAP=$(fc-match -f '%{file}' 'Liberation Serif:style=Bold Italic' 2>/dev/null || echo "$SERIF")
# layout preview: $1 in, $2 out, $3 headline-white, $4 headline-gold, $5 caption
layout() {
  local f="scale=1080:-2"
  [ -n "$3$4" ] && f="$f,drawtext=fontfile=$SANS:text='$3':fontcolor=white:fontsize=58:x=(w/2)-text_w-8:y=h*0.075:shadowx=2:shadowy=2,drawtext=fontfile=$SERIF:text='$4':fontcolor=0xF2C14E:fontsize=62:x=(w/2)+8:y=h*0.072:shadowx=2:shadowy=2"
  [ -n "$5" ] && f="$f,drawtext=fontfile=$CAP:text='$5':fontcolor=white:fontsize=64:x=(w-text_w)/2:y=h*0.735:shadowcolor=black@0.7:shadowx=3:shadowy=3"
  ffmpeg -hide_banner -loglevel error -y -i "$1" -vf "$f" "$2"
}
layout keyframes/KF-S01-02.png previews/PV-V1-01-layout.png "Kid Always" "DYSREGULATED?" "Is your kid"
layout keyframes/KF-S17-01.png previews/PV-V1-02-layout.png "" "" "Just one printable"
layout keyframes/KF-S27-01.png previews/PV-V1-03-layout.png "" "" "Grab yours free."
layout keyframes/PV-V2-01.png  previews/PV-V2-01-layout.png "Losing Your" "CALM?" "Is your kid"
layout keyframes/PV-V2-02.png  previews/PV-V2-02-layout.png "" "" "Just five minutes"
layout keyframes/PV-V3-01.png  previews/PV-V3-01-layout.png "Always Melting" "DOWN?" "Every time"
layout keyframes/PV-V3-02.png  previews/PV-V3-02-layout.png "" "" "Just one printable"
# audio previews: VO over the preview music bed (bed at -18 dB under VO)
mix() {
  local vo=$1 out=$2 dur
  dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$vo")
  ffmpeg -hide_banner -loglevel error -y -i "$vo" -i audio/KMH-V1-v1.0-music-bed-preview.mp3 \
    -filter_complex "[1]volume=0.13,atrim=0:$(python3 -c "print($dur+0.6)")[b];[0]adelay=200|200[v];[v][b]amix=inputs=2:duration=longest:normalize=0[o]" \
    -map "[o]" -ar 44100 -b:a 160k "$out"
  echo "$out $(ffprobe -v error -show_entries format=duration -of csv=p=0 "$out")s"
}
mix audio/AUD-V1-VO.mp3 audio/KMH-V1-INS-20785b5fa6bd-v1.0-V1-audio-preview.mp3
mix audio/AUD-V2-VO.mp3 audio/KMH-V1-INS-20785b5fa6bd-v1.0-V2-audio-preview.mp3
mix audio/AUD-V3-VO.mp3 audio/KMH-V1-INS-20785b5fa6bd-v1.0-V3-audio-preview.mp3
# contact sheet of all 28 storyboard keyframes (7 x 4)
ls keyframes/KF-S*.png | sort > /tmp/kf_list.txt
ffmpeg -hide_banner -loglevel error -y -f concat -safe 0 -i <(sed "s|^|file '$PWD/|; s|$|'|" /tmp/kf_list.txt) \
  -vf "scale=270:-2,tile=7x4:padding=6:color=white" -frames:v 1 previews/contact-sheet.png
echo done
