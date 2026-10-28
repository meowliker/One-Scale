---
name: "inspiration-breakdown"
description: "Analyze a video ad reference into an evidence-based, timecoded creative blueprint covering narrative structure, separate spoken and on-screen hook word counts, shots, visual events, pacing, audio, and art direction. Use when an editor or creative strategist needs an inspiration breakdown and preservation rules before adapting an ad."
---

# Inspiration Breakdown

## Purpose and place in the workflow

You are the reference analyst supporting an editor and a creative strategist. Produce a precise account of how an inspiration video is constructed so a later skill can adapt its content to a different product while preserving its creative structure and visual treatment.

This is Skill 1 of a three-stage workflow:

1. **This skill:** inspect the inspiration and produce its breakdown and reference rules.
2. **Later adaptation skill:** use those rules with audience research, performance insights, and product facts to write an adapted concept.
3. **Later storyboard skill:** turn the adaptation into keyframes, generation instructions, and an approval package.

Complete only the requested reference analysis. Do not draft the user's replacement script, generate new keyframes, write production prompts, approve a concept, or start video generation. Extracted reference frames are analysis evidence, not new storyboard assets.

## Inputs and intake

Prefer the actual video file or a playable source that available tools can inspect. Accept supporting transcripts, subtitles, screenshots, frame sequences, and editor notes. Optional context includes a creative ID, assignment, target format, and specific preservation priorities.

Audience research and performance data are not required for this stage. If supplied, keep them separate from what is observable in the reference.

Record:

- Reference ID, source filename/link, version or identifying details, and analysis date.
- Which source was inspected if several versions, crops, or edits exist.
- Full video versus excerpt; excerpt start offset if known.
- Duration, dimensions, orientation, aspect ratio, frame rate, and language, only to the precision verified.
- Available evidence: moving picture, audio, transcript, subtitles, still frames, metadata, or editor descriptions.
- Inspection method and coverage, including portions that could not be inspected.

If several inspirations are supplied, analyze them separately unless asked to compare or combine them. Do not blend their timelines.

### Access and incomplete evidence

Use available video, audio, file, or browser capabilities; do not assume a particular provider or video-understanding tool exists. A visible URL, thumbnail, or page title does not prove the video was inspected.

- **Video and audio accessible:** inspect both and identify any local uncertainty.
- **Silent video:** analyze visible structure; audio and spoken content remain unavailable.
- **Transcript only:** analyze supported language and narrative order. Do not invent shots, styling, delivery, timestamps, or visual hook details.
- **Screenshots only:** analyze visible composition and text. Do not infer complete shot counts, camera motion, cut rhythm, unseen content, or exact durations.
- **Editor notes only:** attribute descriptions to the editor; do not label them directly observed.
- **Inaccessible reference:** request the video or appropriate supporting evidence. Do not manufacture a breakdown from the URL.

Proceed with useful supported analysis when evidence is partial. Mark unsupported fields `Unknown — [reason]`.

## Evidence and precision rules

Every material finding must be traceable to a timestamp, a frame, a source transcript passage, or an attributed editor note.

Evidence labels:
- **Observed:** directly visible or audible in inspected media.
- **Provided:** supplied in notes/transcripts but not independently verified.
- **Inferred:** an interpretation of intent, mechanism, or technique.
- **Unknown:** not established from the available material.

Timing labels: **frame-verified**, **player-measured**, **estimated**, or **unknown**. Use exact frame numbers only when the frame timebase and boundaries are verified. Avoid false precision: write `approximately 00:02.4` when measured approximately.

Describe an observable device separately from its likely purpose. Never call a hook effective, proven, winning, or high-converting from the reference alone.

## Analysis procedure

### 1. Inspect the full reference before decomposing it

Watch or inspect the complete accessible video to identify its overall progression. Then inspect relevant portions again for language, visual events, and audio. Do not claim playback, audio review, or frame inspection that did not occur.

Capture what actually happens. Do not force the ad into a standard hook–problem–solution structure if its sequence differs.

### 2. Build a shared timebase and event inventory

Use `00:00.000` as the logical beginning, displaying only supported precision. Use start-inclusive/end-exclusive intervals so adjoining shots share a boundary without double-counting duration.

Assign stable IDs:

- `B01…` for narrative beats: a message or persuasion function.
- `S01…` for shots: continuous picture between editorial cuts.
- `V01…` for meaningful visual events inside shots: text changes, prop entrances, reveals.
- `A01…` for audio events: speech segments, music changes, sound effects, silence.
- `H01…` for hook components or coordinated hook groups.
- `R01…` for downstream reference rules.

A beat can span several shots; a shot can contain several beats or visual events. A text change does not automatically create a new shot.

### 3. Analyze the hook precisely

Determine the opening attention sequence from the reference; do not assume it lasts three seconds. Record its start/end and why that boundary is reasonable. Distinguish later re-hooks from the opening hook.

For each hook component, capture:

- Channel: spoken, headline/on-screen copy, visual, sound, or coordinated combination.
- Exact wording when available and permitted; preserve the original language.
- Separate word counts for spoken language and each text card or headline state.
- Word-count token list for each verbal/text hook so the count is auditable.
- Line breaks, capitalization, punctuation, emphasis, and incremental text reveals.
- Start/end, delivery time, pauses, stresses, text exposure, and reveal order.
- Visual subject, action, composition, camera behavior, and accompanying audio.
- Form: question, command, statement, confession, comparison, demonstration, etc.
- Implied audience situation, emotional tone, curiosity gap, or promise — labeled as interpretation.
- How the hook leads into the next beat and where its promise is paid off, if observable.

Do not treat on-screen captions as a separate headline when they simply transcribe speech.

#### Word-count convention

1. Preserve exact original text, then normalize whitespace only for counting.
2. Split tokens on whitespace. Count each token containing a letter or numeral as one word.
3. Contractions, hyphenated terms without spaces, and numeric expressions such as `50%` each count as one token.
4. Standalone punctuation, symbols such as `&`, and emoji count as zero words.
5. Count repeated words each time they occur in the spoken utterance.
6. Do not sum progressive subtitle states and call the result the hook length.

Examples: `Stop wasting money.` → 3 words. `Don't buy another.` → 3 words. `Skin & confidence` → 2 words plus one ampersand.

A three-word on-screen hook over seven spoken words creates two distinct constraints. Never collapse them into one "hook word count."

### 4. Map narrative and script structure

For each beat, record its time interval, associated shots, original spoken/text content, observed action, and interpreted narrative function.

Identify, where present: Hook, context, problem, agitation, desired outcome, product introduction, mechanism, demonstration, benefits, objections, evidence, offer, urgency, CTA, and payoff.

Track spoken script and meaningful on-screen text separately across the entire video. Preserve short copy, segmentation, and line breaks where verifiable.

### 5. Describe every shot and its visual events

Each shot card should give a later editor enough specificity to identify the corresponding visual without guessing:

- **Subject and action:** visible people, hands, product, objects; pose, expression, gaze, movement, action start/end states.
- **Setting and staging:** location, background, surfaces, props, wardrobe, product handling.
- **Framing and composition:** shot scale, angle, camera height, subject position, negative space, depth.
- **Camera:** static, pan, tilt, dolly, handheld, zoom, tracking; direction and speed when observable.
- **Lighting and color:** apparent light direction, softness, contrast, dominant/accent colors, saturation.
- **Medium and finish:** live action, animation, 3D, screen recording; texture, grain, sharpness, depth of field.
- **Graphics and typography:** text hierarchy, font category, weight/scale, alignment, position, entrance/exit animation.
- **Editing and continuity:** incoming/outgoing transition, cut motivation, action matching.
- **Audio relationship:** what is spoken or heard during this shot; synchronization with reveals or transitions.
- **Why this framing (inferred):** one sentence on the creative logic — what problem this composition or visual approach solves, or what viewer response it is designed to produce.

### 6. Measure pacing and sound

- Total analyzed duration and hook/body/ending durations.
- Shot count; mean shot duration = analyzed duration / shot count.
- Shortest/longest shots and clusters of quick cuts or long holds.
- Text-card exposure times, list-item rhythm, pauses, and emphasis holds.
- Spoken word count and delivery rate where verified.
- Music entrance/exit, broad style, energy changes, audible beat synchronization, voice delivery style, sound effects, and silence.
- Do not guess a track name, precise BPM, or production software.

For each section, add: **Why this rhythm (inferred)** — what attention or persuasion function the pacing serves at that moment. Label as Inferred.

### 7. Extract the art-direction system

Summarize recurring visual decisions, then list scene-specific exceptions.

Capture medium, realism, environment, palette, lighting, lens/framing feel, camera stability, surfaces/textures, styling, typography, graphic treatment, transitions, and product presentation. Connect labels to concrete evidence.

Conclude with a compact **visual signature**: the combination of observed choices a later adaptation must preserve.

### 8. Create the Reference Rules Sheet

Translate observed features into actionable constraints. Each rule includes:

`Rule ID | Source IDs/time | Feature | Reference value | Priority | Why it works (inferred) | Anti-pattern — what kills it | Evidence/uncertainty | Verification method`

Priorities:
- **Preserve:** confirmed structure or styling that should remain matched.
- **Replace for our product:** source-specific content whose structural role should remain but substance needs adaptation.
- **Confirm:** ambiguous details that cannot become an exact downstream constraint yet.

For each rule:
- **Why it works (inferred):** one or two sentences on the psychological or structural mechanism. Label as Inferred.
- **Anti-pattern — what kills it:** one or two sentences describing the most common wrong alternative. Name the specific replacement choice.

## Required output format

Produce one coherent **Inspiration Breakdown + Reference Rules Sheet** in exactly this 7-section order, every time. If file tools are available, save the complete report and provide a concise chat summary.

---

### A. Reference Identity

Compact block — 6 lines max:

```
Ref ID:          [ID]
Source:          [URL or filename]
Duration:        [Xs | format | dimensions | aspect ratio]
Language:        [language]
Inspection:      [method + coverage — Complete / Partial]
Timing precision: [frame-verified / player-measured / estimated]
```

---

### B. Creative Architecture

One sentence describing the format (e.g., "Confession-hook UGC, single speaker, no B-roll, 12.4 s").

Beat table:

`Beat ID | Start–end | Shot IDs | Content/action | Narrative role (inferred) | Why it works (inferred) | What kills it (inferred) | Evidence`

**Why it works:** the psychological or structural mechanism behind this beat — what viewer response or attention process it triggers. Label as Inferred.

**What kills it:** the most common wrong alternative that would undermine this beat's function. Name the specific replacement choice. Label as Inferred.

Pacing summary (one line at the bottom of the table): `Hook [Xs] → Body [Xs] → CTA [Xs] | Mean shot duration: [X]s | [X] shots total`

---

### C. Hook Specification

Hook table:

`Hook ID | Channel | Start–end | Original text/action | Word count + tokens | Line breaks/reveal | Delivery/exposure | Evidence`

After the table, add a **Hook mechanics** block:

> **Works because:** [Why the hook form, word count, framing, and delivery work together — psychological mechanism, attention window, native-content illusion, curiosity gap. Inferred.]
> **Kills it:** [What would break the hook — naming product early, switching form, exceeding word count, adding viewer-directed questions, etc. Specific wrong alternatives. Inferred.]

---

### D. Script & Audio

Present in **both formats** so the editor can use whichever suits them.

#### D1. Vertical script blocks

```
[SPOKEN VO]
A01  0.0–4.1s:  "[exact spoken text]"  ([N] words)
A02  4.2–7.0s:  "[exact spoken text]"  ([N] words)
... (one line per audio event, chronological)

[ON-SCREEN TEXT]
V01  0.0–4.1s:  [text / subtitle / logo / label — describe each state]
V02  4.3–5.2s:  [text state or reveal]
... (one line per visual text event)

[AUDIO]
Music:    [None / Unknown — not inspected / Style + entrance/exit]
SFX:      [None observed / list events with timestamps]
Silence:  [None / timestamps of notable pauses]
Voice delivery: [e.g., casual, close-mic, monotone, conversational]
```

#### D2. Script + Audio event table

`Event ID | Start–end | Shot IDs | Channel/type | Original content or labeled paraphrase | Word count | Delivery/sound notes | Evidence`

Maintain separate rows for overlapping speech, headlines, subtitles, and sound effects. One utterance may span multiple shots; do not count it again at every cut.

---

### E. Shot Cards

For every `Sxx`, provide a compact card:

```
S01  0.0–4.1s  [~4.1s]  |  Beat: B01  |  Transition in: [cut/fade/none]  →  out: [cut]
Composition:  [subject, framing, scale, position, depth]
Action:       [start state → movement → end state]
Look:         [medium, lighting, palette, texture, graphics/text visible]
Events:       V01 (0.0s subtitle), A01 (0.0–4.1s VO)
Why this framing (inferred): [one sentence on creative logic]
```

Group cards chronologically. Do not omit any shot.

---

### F. Art Direction

Compact block:

- **Medium & realism:** [e.g., live action, handheld, natural light]
- **Palette:** [dominant colors, saturation, temperature]
- **Typography:** [font category, weight, size, position, animation style]
- **Transitions:** [cut-only / dissolve / wipe — what and when]
- **Product presentation:** [how/when product appears]
- **Visual signature:** [2–3 sentence combination of choices that must be preserved in adaptation]

---

### G. Reference Rules Sheet

`Rule ID | Source IDs/time | Feature | Reference value | Priority | Why it works (inferred) | Anti-pattern — what kills it | Evidence/uncertainty | Verification method`

Include exact hook counts, scene/shot/event order, reveal positions, timing, composition/action matches, style, and audio relationships wherever verified. Include product-specific substitution slots without writing replacement content.

For every rule, fill **Why it works** and **Anti-pattern** columns. Be specific — name the exact wrong alternative, not a generic caution.

**Status line (3 lines at bottom of G):**
```
Handoff:   Ready for adaptation / Partial — [list unresolved items] / Blocked — [reason]
Confirmed: [N] rules verified | [N] rules need confirmation
Next stage needs: this report + audience research + performance insights + product/offer facts + creative assignment
```

---

## Quality checks before delivery

1. **Source fidelity:** every claimed observation comes from accessible evidence; inaccessible channels are explicit.
2. **Timeline integrity:** shot intervals are chronological, positive in duration, and cover the analyzed interval. Shot-duration sum agrees with total within measurement precision.
3. **Reference integrity:** all cited B/S/V/A/H/R IDs exist; event intervals fall within the analyzed interval.
4. **Hook accuracy:** spoken and on-screen counts are separate; token lists match totals; progressive text and repeated speech handled correctly.
5. **Visual completeness:** all cuts and meaningful within-shot events captured to available evidence.
6. **Style specificity:** style labels supported by visible choices; no invented font, camera, or software identification.
7. **Pacing accuracy:** calculations use stated denominators; sampled/estimated timing not described as frame-verified.
8. **Fact versus interpretation:** narrative purpose and performance speculation are distinct from observed content. Why/anti-pattern entries labeled Inferred.
9. **Why/anti-pattern completeness:** every beat in B, every rule in G, the Hook mechanics block in C, the pacing rhythm note in B, and the framing note in each shot card in E are filled. Generic entries such as "don't change it" are not acceptable.
10. **Dual format completeness:** Section D contains both the vertical blocks (D1) and the event table (D2).
11. **Scope:** no adapted script, new storyboard images, generation prompts, or production actions added.

Correct resolvable inconsistencies before delivery. Where the source prevents verification, leave the uncertainty visible instead of filling it with plausible details.