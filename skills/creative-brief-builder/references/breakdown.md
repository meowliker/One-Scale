# Inspiration Breakdown

How to break down the inspiration video. Every borrow type uses this file. The borrow file says how deep to go.

## Contents
1. Getting at the video
2. Honesty rules
3. The second-by-second table
4. Hook analysis
5. Structure, pacing, and style summary
6. Depth by borrow type

---

## 1. Getting at the video

Use whatever the chat can actually do. Don't assume a tool exists.

| What you have | What to do |
|---|---|
| Video file uploaded, code execution available | Extract frames (e.g. `ffmpeg -i in.mp4 -vf fps=2 frames/%04d.jpg`; use `fps=4` for the first 5 seconds if cuts are fast) and look at them in order. Get the audio transcript with any speech-to-text available (e.g. whisper). Read `ffprobe` for duration and dimensions. |
| Ad library / creative tool connected (one that can transcribe or break down an ad from a link) | Use it for the transcript and any frame or shot data. Still look at frames if you can get them. |
| Link only, nothing can open it | Say so. Ask for the file, a screen recording, or a transcript plus 4–8 screenshots (one per scene). Don't build a breakdown from the URL, title, or thumbnail. |
| Transcript only | You can analyse the words, hook text, and script structure. Visuals, timing, and on-screen text stay `Unknown`. Ask for screenshots if the borrow needs visuals. |
| Screenshots only | You can analyse composition and on-screen text. Cut rhythm, motion, audio, and exact timing stay `Unknown`. |
| Strategist describes the video | Use the description and mark it `(per strategist)`. |

If several inspirations are given, label them **A, B, C…** and break each down separately. Never merge their timelines.

## 2. Honesty rules

- Describe only what you saw or heard. If a detail wasn't visible, write `Unknown` and say why ("audio not available", "only 5 screenshots").
- Keep **what happens** separate from **why it works**. "Why it works" is your interpretation, so phrase it that way ("likely works because…").
- Timing precision: give times like `0:02.5` when frames prove it, `~0:03` when estimated. Don't fake precision.
- A video doesn't "win" just because a competitor runs it. Long-running or heavily duplicated ads are a signal, not proof. Say what you know ("running 60+ days per the library") only if that information was given.

## 3. The second-by-second table

This is the core output. Keep the language simple enough that an editor could rebuild the video from it.

```
| Time | What we see | What we hear (VO / talking) | On-screen text | Sound / music | Why it's there |
|---|---|---|---|---|---|
| 0:00–0:02 | Close-up, woman's hand slams alarm clock, messy bedside table, handheld | — | "I was exhausted for 3 years" | Alarm buzz, then silence | Pattern interrupt + relatable pain in under 2s |
| 0:02–0:04 | ... | ... | ... | ... | ... |
```

Rules:
- One row per **shot** (a cut means a new row). If one shot runs long with several things happening, split the row at each meaningful change: new text, new line of VO, product appears, reveal.
- **What we see:** subject, action, framing (close-up / medium / wide / overhead / POV / selfie), camera (static / handheld / zoom / pan), setting, and props. Be specific: "hand peels label off a jar, overhead, kitchen counter" beats "product shot".
- **What we hear:** exact words, in the original language. Translate in brackets if it isn't English.
- **On-screen text:** exact words, plus line breaks (`/`), CAPS, emojis, and highlighted words. Write `= captions` if it just subtitles the VO.
- **Sound / music:** music style and energy changes, SFX, silences. Don't guess track names or BPM.
- **Why it's there:** one short line on its job (hook, pain, agitation, proof, product reveal, demo, benefit, objection, offer, urgency, CTA).

## 4. Hook analysis

Do this for every borrow type. The hook is the opening attention sequence. Find where it actually ends (often 1–3s, sometimes 5s); don't assume 3s.

```
HOOK (0:00–0:0X)
Spoken hook:    "[exact words]"   → [N] words
Text hook:      "[exact words]"   → [N] words   (line breaks: "line 1 / line 2")
Visual hook:    [what we see in the first 1–2 seconds, specific]
Sound:          [what we hear at second 0]
Mechanism:      [question / confession / callout / result-first / comparison /
                 pattern interrupt / POV / number / swap / curiosity gap / demo]
Who it targets: [the person or situation the hook calls out]
Promise / gap:  [what the viewer is waiting to find out]
Why it likely works: [1–2 lines]
Payoff:         [where in the video the promise is answered, with timestamp]
```

**Word count:** count words separated by spaces. Contractions, `50%`, `3x`, and hyphenated words count as 1. Emojis and symbols count as 0. Count spoken and text hooks separately and never add them together; a 4-word text hook over a 9-word spoken line gives two separate targets. If the text builds up word by word, count only the final full version.

## 5. Structure, pacing, and style summary

Give these after the table, short:

- **Format in one line:** e.g. "Selfie-UGC confession, single creator, B-roll cutaways, ~28s, captions on."
- **Beat map:** `Hook (0–2s) → Pain (2–7s) → Failed solutions (7–12s) → Product reveal (12–14s) → Demo (14–22s) → Proof (22–25s) → CTA (25–28s)`. Use the video's real sequence; don't force a template onto it.
- **Pacing:** total length, number of shots, average shot length, and where it speeds up or holds.
- **Style:** footage type (UGC / studio / AI / stock / screen recording), lighting and colour feel, caption style (font type, colour, position, animation), music feel, and how the product is shown.
- **Visual signature:** the 3–5 things that make this video look like *this* video. These are what we keep when we copy the format.

## 6. Depth by borrow type

| Borrow | Breakdown needed |
|---|---|
| Full copy | Everything: full table, hook analysis, summary |
| Hook text | Hook analysis (focus on words, mechanism, why it works) + the 1–2 rows right after the hook so you know how they bridge. Skip the full table. |
| Visual hook | Very detailed rows for the hook seconds (split into 0.5s steps if a lot happens) + hook analysis focused on the visual and sound. Skip the rest. |
| Format | Full table, but describe each row by its **job and visual approach** more than their exact words. Plus beat map, pacing, and visual signature. |
| Mix | Each element at its own depth, tagged by source (A/B). |
