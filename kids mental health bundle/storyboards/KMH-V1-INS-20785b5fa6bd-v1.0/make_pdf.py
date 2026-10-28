"""Markdown -> HTML -> Chromium PDF (A4 landscape), images resolved relative to this folder.
Run:  python3 make_pdf.py storyboard-package.md   ->  storyboard-package.pdf
Needs: python3 markdown, node + playwright (Chromium). Run build_assets.sh first so keyframes/ exists."""
import json, os, pathlib, re, subprocess, sys

import markdown

os.chdir(os.path.dirname(os.path.abspath(__file__)))
src = pathlib.Path(sys.argv[1])
text = src.read_text()
title = re.search(r"^# (.+)$", text, re.M).group(1)
body = markdown.markdown(text, extensions=["tables", "fenced_code", "sane_lists"])
html = f"""<!doctype html><html><head><meta charset="utf-8"><title>{title}</title>
<base href="{pathlib.Path.cwd().as_uri()}/"><style>
body{{font-family:Inter,Helvetica,Arial,sans-serif;font-size:10.5px;line-height:1.4;color:#1d1d1f;margin:0}}
h1{{font-size:20px}} h2{{font-size:16px;border-bottom:1px solid #ccc;padding-bottom:2px;margin-top:18px}} h3{{font-size:13px}}
table{{border-collapse:collapse;width:100%;margin:6px 0;page-break-inside:auto}} tr{{page-break-inside:avoid}}
th,td{{border:1px solid #d0d0d0;padding:3px 5px;vertical-align:top;text-align:left}} th{{background:#f2f2f2}}
code{{font-size:9.5px;background:#f4f4f4;padding:0 2px;word-break:break-all}} pre{{white-space:pre-wrap;background:#f6f6f6;padding:6px}}
img{{max-width:100%}} blockquote{{border-left:3px solid #c9a227;margin:6px 0;padding:2px 10px;background:#fbf8ec}}
</style></head><body>{body}</body></html>"""
tmp = src.with_suffix(".tmp.html")
tmp.write_text(html)
js = """const {chromium} = require('playwright');
(async () => { const b = await chromium.launch(); const pg = await b.newPage();
  await pg.goto(%s, {waitUntil: 'networkidle'});
  await pg.pdf({path: %s, format: 'A4', landscape: true, printBackground: true,
    margin: {top: '12mm', bottom: '12mm', left: '10mm', right: '10mm'}});
  await b.close(); })();""" % (json.dumps(tmp.resolve().as_uri()), json.dumps(str(src.with_suffix(".pdf").resolve())))
subprocess.run(["node", "-e", js], check=True)
tmp.unlink()
print("wrote", src.with_suffix(".pdf"))
