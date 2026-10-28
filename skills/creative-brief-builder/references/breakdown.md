# Inspiration Breakdown

How to break down the inspiration video. Every run starts with the **beat table** in section 3. That's the team's standard breakdown, the same for every inspiration. The borrow type only decides which extra detail goes underneath it.

## Contents
1. Getting at the video
2. Honesty rules and evidence labels
3. The beat table (always)
4. Hook card (always)
5. Shot details (full copy, format, visual hook)
6. Format summary (always, short)
7. Depth by borrow type

---

## 1. Getting at the video

### If there's a video file: run the analysis script first, every time

Exact timings like `2.703` come from measuring the file, not from watching it. Before writing anything, run:

```bash
python <skill-dir>/scripts/analyze_video.py <video file> --out video_analysis
```

It prints a shot list with **frame-accurate cut times**, the VO words spoken in each shot (when speech-to-text is available), and saves frames: start/middle/end of every shot, the hook every 0.25s, and contact sheets. Then:
1. **Look at every contact sheet and every hook frame.** Read the on-screen text from the frames and describe what you see. Don't skip shots.
2. If the shot count looks wrong (soft cuts missed in animation, or shaky UGC split into too many shots), re-run with `--threshold 0.2` or `--threshold 0.4`.
3. If ASR isn't installed, try `pip install faster-whisper` once and re-run. If that fails, take the VO from captions in the frames, a transcript, or an ad-library tool. Then mark VO evidence `Provided` or `Observed (captions)`.
4. Build the beat table from these results. **Beat boundaries sit on the measured cut times or VO timestamps**, never on rounded guesses.

If ffmpeg isn't available, say so in one line, use the other rows below, and mark timings `estimated`.

### Other situations

| What you have | What to do |
|---|---|
| Ad library / creative tool connected (one that can transcribe or break down an ad from a link) | Use it for the transcript and any shot data. Still look at frames if you can get them. |
| Link only, nothing can open it | Say so. Ask for the file, a screen recording, or a transcript plus 4–8 screenshots. Don't build a breakdown from the URL, title, or thumbnail. |
| Transcript only | Beat table with words only. Visuals and shot columns say `Unknown — no video`. Ask for screenshots if the borrow needs visuals. |
| Screenshots only | Composition and on-screen text only. Timing and audio are `Unknown`. |
| Strategist describes the video | Use it and label the evidence `Provided (strategist)`. |

If several inspirations are given, label them **A, B, C…** and break each down separately. Never merge their timelines.

## 2. Honesty rules and evidence labels

Every beat gets an evidence label so the strategist knows what is seen vs. assumed:

| Label | Means |
|---|---|
| **Observed** | Seen or heard directly in the video or frames you inspected |
| **Provided** | From a transcript, notes, or the strategist, not checked against the video |
| **ASR** | From automatic speech-to-text, so words may have small errors |
| **Inferred** | Your interpretation (narrative roles, "why it works", intent) |
| **Unknown** | Not available, with the reason |

Combine labels when the parts differ, e.g. `Observed (picture/text); VO Provided+ASR`.

- Describe only what you saw or heard. Never invent shots, text, or timing.
- **Timing:** use seconds with 3 decimals (`2.703`) only when cut detection or frame stepping gives them. Otherwise use 1 decimal with `~` (`~2.7`). Don't fake precision.
- The *narrative role* column is always interpretation, which is why its header says "(inferred)".

## 3. The beat table (always)

A **beat** is one job in the story (hook, problem, agitation, pivot, solution, benefit, proof, offer, CTA…). A beat usually spans several shots. Use this exact table:

| Beat | Start–end (s) | Shots | Original content / action | Narrative role (inferred) | Evidence |
|---|---|---|---|---|---|
| B01 | 0.000–2.703 | S01 | Headline "Always Feeling BLOATED?" + VO "Every time you eat, it starts with a little bloating." Split screen: hunched X-ray skeleton with swelling belly and green gas cloud vs. upright skeleton | Hook: names the problem and its trigger (eating) | Observed (picture/text); VO Provided+ASR |
| B02 | 2.703–12.813 | S02–S06 | Symptom stack: jeans tighter → stomach rock hard → painful gas trapped → burping/passing gas → heavy feeling won't go away | Problem escalation, one symptom per shot | Observed / Provided |
| B05 | 30.297–33.300 | S16 | "what if your gut has been asking for a different kind of support?" over a dark gut interior with grinning worm creatures | Pivot / re-hook question; implies a hidden internal cause | Observed / Provided; "cause" framing Inferred |

How to fill each column:
- **Beat:** `B01, B02…` in order. Split at every change of job, including re-hooks and pivots.
- **Start–end (s):** seconds, start of the beat to the start of the next beat.
- **Shots:** the shot IDs inside this beat (`S01`, `S02–S06`). Shots are numbered by cuts across the whole video.
- **Original content / action:** quote **every** line. All on-screen text and the full VO for the beat, word for word, never summarised ("Symptom stack: …" is only allowed as a lead-in before the full quoted lines). The conversion copies these exact lines, so anything summarised here gets lost. Order: on-screen text as `Headline "…"` or `Text "…"` (keep their CAPS and punctuation), then `VO "…"` (exact words, original language, with a translation in brackets if needed), then a plain, specific description of the visual. For lists or escalations, use `→` between items. For rhetorical patterns, name them briefly (e.g. "negation ×2 → positive list ×3").
- **Narrative role (inferred):** the beat's job in 3–8 words, plus a few words on how it does it.
- **Evidence:** the labels from section 2.

Put the one-line header above the table: `🎬 [Inspiration name / brand] · [duration]s · [ratio] · [N] shots · [N] beats`.

## 4. Hook card (always)

The hook is the opening attention sequence. Find where it really ends (often 1–3s); don't assume 3s.

| Hook (B01 · 0.000–2.703) | |
|---|---|
| **Text hook** | "Always Feeling BLOATED?" → **3 words** |
| **Spoken hook** | "Every time you eat, it starts with a little bloating." → **10 words** |
| **Visual hook** | Split screen: hunched X-ray skeleton with swelling belly + green gas cloud vs. upright skeleton |
| **Sound at 0s** | [what we hear] |
| **Mechanism** | Question + problem callout + before/after visual |
| **Who it calls out** | People who bloat after meals |
| **Open loop** | Why does eating cause this, and what fixes it? |
| **Why it likely works** | [1–2 lines, inferred] |
| **Paid off at** | B06 (33.300s): the solution |

**Word count:** count words separated by spaces. Contractions, `50%`, `3x`, and hyphenated words count as 1. Emojis and symbols count as 0. Count text and spoken hooks separately and never add them together. If the text builds up word by word, count only the final version.

## 5. Shot details (full copy, format, visual hook)

When the borrow needs us to recreate visuals, add a shot table under the beat table. Keep each cell short and specific enough to film or generate from:

| Shot | Start–end (s) | What we see | Framing / camera | Text on screen | Audio |
|---|---|---|---|---|---|
| S01 | 0.000–2.703 | Split screen: left, hunched X-ray skeleton, belly swells, green gas cloud; right, upright skeleton | Static, centred, dark background, 3D render | "Always Feeling BLOATED?" white bold, top | VO starts at 0.0s, low music |

- One row per shot, using the same IDs as the beat table.
- If cut times inside a beat aren't known, give the shot the beat's range with `within B0X` (e.g. `within 2.703–12.813`). If a beat's visuals are completely unknown, use **one grouped row** (`S07–S12 | 12.813–23.157 | Unknown (no video)`) rather than six empty rows.
- For a visual-hook borrow, show only the hook shots, split into ~0.5s steps if a lot happens.

## 6. Format summary (always, short)

| | |
|---|---|
| **Format** | e.g. 3D X-ray animation explainer, VO-led, bold headline captions, 55s |
| **Beat flow** | Hook → Symptom stack → Life impact → Chronic → Pivot question → Solution + usage → Benefit contrast → Routine → CTA |
| **Pacing** | [N] shots in [X]s, average [Y]s per shot; fast in [where], slow in [where] |
| **Look** | Medium, colour palette, lighting, caption style (font, colour, position), how the product appears |
| **Visual signature** | The 3–5 things that make it look like *this* video |

## 7. Depth by borrow type

| Borrow | Beat table | Hook card | Shot details | Format summary |
|---|---|---|---|---|
| Full copy | ✅ | ✅ | ✅ all shots | ✅ |
| Format | ✅ | ✅ | ✅ all shots | ✅ |
| Visual hook | ✅ | ✅ | ✅ hook shots only | ✅ |
| Hook text | ✅ | ✅ | — | ✅ |
| Mix | ✅ per inspiration (A, B…) | ✅ | as the borrowed parts need | ✅ |
