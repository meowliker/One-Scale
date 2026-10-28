---
name: "storyboard-approval"
description: "Turn an adapted video-ad concept into a shot-by-shot visual storyboard with actual review keyframes, audio previews, a V1–V3 variation preview section, exact script and text, timeline, image/video prompts, and a versioned creative-strategist approval package. Use after inspiration breakdown and data-informed adaptation to prepare editors for execution in Kie AI, Google Flow, or an available production tool after approval."
---

# Storyboard and Approval

## Purpose and workflow position

Act as the preproduction specialist supporting the editor and creative strategist. Convert the selected adapted concept into an unambiguous visual plan that the strategist can review and the editor can execute. Preserve the wording, structure, reference constraints, and product truth established upstream.

This is Skill 3:

1. **Inspiration Breakdown:** source beats, shots/events, timing, hooks/counts, art direction, and Reference Rules Sheet.
2. **Data-Informed Adaptation:** evidence-linked adapted script, corresponding visual concepts, product facts/assets, and match audit.
3. **This skill:** V1–V3 variation previews, visual storyboard, actual keyframe previews, audio previews, production instructions and prompts, approval record, and execution handoff.

The default task ends with a complete package marked **Awaiting strategist approval**. Preparing and generating review stills is part of this task and does not require prior storyboard approval. Full video generation and final production follow approval. Do not run video generation merely because the package is finished; execute when requested and approval covers the relevant version and scope. A current instruction to execute an approved package is sufficient; do not request the same approval again.

By default, the full storyboard is built for the variation the user selects (V1 if none is named), and V1, V2 and V3 from Skill 2 each get a lighter preview in the Variation Previews section (Section 6A). Generating preview stills and preview audio is part of review preparation and does not need prior approval.

Do not restart audience research, create competing concepts, or silently improve/rewrite the chosen script. Identify material upstream problems, preserve usable work, and request the specific correction or decision needed. Do not send the package to anyone through email, chat, or a project service unless the user explicitly authorizes that action; producing a submission-ready package is the default.

## Inputs and intake

Read the actual source files. Accept MD, JSON, documents, images, and accessible tool outputs. The source packages can be provided directly; installed versions of Skills 1 and 2 are not prerequisites if their outputs are available.

Required working inputs:

- Skill 2's selected adaptation: complete script, text events, visual concepts, evidence/fact IDs, match audit, and unresolved issues.
- Skill 2's V1, V2 and V3 cards: angle, persona, pain point, hook text, B01–B03 script, META DATA EVIDENCE and AUDIENCE DATA EVIDENCE (needed for the Variation Previews section).
- Skill 1's source timeline, shot/event IDs, hook specifications, art direction, and reference rules, either separately or included in Skill 2's package.
- Product/packaging references, logo, required brand elements, genuine proof assets, and accurate offer/CTA details.
- Creative assignment and output specifications: language, intended duration, aspect ratio, and destination where known.

Useful additional inputs: existing presenter/character references, voice direction, production method per shot, Kie AI or Google Flow preference, available generation capabilities, editor, strategist, and delivery destination.

Record creative ID, package version, upstream filenames/links/versions, target format, reference identity, and production preferences. Do not invent editor or approver names. If contact details are missing, use role labels. A request to build this reusable skill is not a request to generate a particular ad's assets.

### Incomplete inputs

- A complete adaptation is enough to start; raw audience and performance exports need not be resubmitted if the relevant decisions and sources are carried forward.
- If versions conflict, identify the conflicting fields and use the explicitly selected version. Do not merge incompatible scripts.
- If timing is estimated upstream, retain that label. A planned edit boundary can be precise without pretending the source measurement was precise.
- If product images or proof assets are missing, build supported shot specifications and mark dependent frames/claims unresolved. Do not invent packaging or proof.
- If image-generation tools are unavailable, produce the full text storyboard, image prompts, and missing-frame manifest. Label it **Partial draft — visual previews missing**, not a complete visual storyboard.
- If only a reference is supplied and no adaptation exists, identify the missing adaptation; do not manufacture final product copy under this skill.
- If the generation provider/model is undecided, write complete provider-neutral prompts and clearly marked settings to confirm. Provider selection alone need not block visual creative review, but unresolved essential execution requirements prevent a production-ready handoff.

Continue unaffected work. Ask concise questions only for decisions or information that cannot be derived from the supplied material.

## 1. Freeze the selected creative into a versioned plan

Create a canonical script and timeline before making keyframes. Preserve upstream IDs `Bxx`, `Sxx`, `Vxx`, `Axx`, `Hxx`, `Rxx`, `AUDxx`, `PERFxx`, `FACTxx`, `DECxx`, and `Xxx`. Not every package needs every ID family; retain those supplied and add missing IDs consistently without breaking existing references.

Assign:

- `KF-S01-01…` to keyframes, grouped by shot.
- `IMG-S01-01…` to image prompts.
- `VID-S01-01…` to video-generation instructions/prompts.
- `ASSET01…` to reusable product, person, location, voice, and proof references.

Use one creative/package version across the storyboard, keyframes, prompts, and approval record. Reference actual file/asset versions. Do not overwrite a previously approved package with materially different content; retain it and create a revision.

Keep the exact selected spoken script, on-screen copy, offer, CTA, hook counts, scene order, reveal points, and art treatment. For corrections affecting these choices, document the proposed change and its source rather than silently accepting it as a formatting adjustment.

## 2. Build the master edit timeline

"Frame by frame" means every planned shot plus every important visual state within it; it does not mean generating one still for every encoded frame.

Use the same time origin as the adaptation. Express absolute start/end times and duration for each shot, with start-inclusive/end-exclusive intervals. Keep the complete intended ad duration, including pauses, inserts, transitions, and the end card.

Within each shot, map:

- Exact speech/dialogue events, including pauses, emphasis, and who speaks.
- On-screen text states and their exposure/reveal windows.
- Character/hand/product actions and beginning/end states.
- Product entrance, proof, reaction, and other key visual events.
- Camera movement, transitions, and synchronized sound cues.

Maintain both ad time and shot-local time where needed for generation prompts. For example, an event at ad time 00:06.0 inside a shot beginning at 00:04.0 is at shot-local +2.0 seconds.

Audio can continue across cuts; preserve it as one audio event linked to multiple shots. Overlapping speech, text, and effects are valid. Shot partitions should not accidentally overlap or leave gaps. Record dissolve/transition intervals and identify editorial boundaries consistently with the source.

Use actual frame indices only when the intended edit timebase is known. Record exact rational frame rates where relevant and the timecode convention if frame-based timecode is used. Do not convert estimated source timings into claims of frame-verified measurement. If the edit frame rate is undecided, use seconds and make frame quantization a later explicit technical check.

## 3. Define continuity and the visual system

Create a compact visual continuity specification shared by all shots:

- Product appearance, packaging geometry, label/logo reference, color, size relationships, and permitted handling/use.
- Presenter/character reference, visible description, wardrobe, accessories, hair, and recurring expressions/gestures where relevant.
- Location, surfaces, props, spatial arrangement, light direction, and time-of-day appearance.
- Art medium, realism, palette, contrast, textures, lens/framing feel, camera movement, and graphical treatment.
- Typography category, hierarchy, alignment, line breaks, text placement, and motion treatment.
- Voice/language/delivery, music energy, sound design, and continuity across cuts.

Preserve the reference art style and Skill 2's authorized product substitutions. Do not add generic cinematic lighting, shallow depth of field, glossy surfaces, or dramatic camera moves unless the reference calls for them.

Define important state continuity: which hand holds the product, which direction it moves, lid open/closed, amount dispensed, object position, gaze direction, and whether the next shot continues or resets an action. Track changes rather than requiring identical states when an action should change them.

Use the actual product assets as visual truth. A generated lookalike package is not an accurate product reference. Where reliable labeling or proof cannot be generated, plan a faithful supplied-asset composite or editor overlay and show the intended result in the review preview. Do not invent customer evidence, numerical results, endorsements, or a stronger demonstration than the facts support.

## 4. Specify and produce the review keyframes

Each shot needs at least one actual representative image in a complete visual approval package. Use multiple keyframes when the action, reveal, camera change, or text state cannot be reviewed from one still.

Typical coverage:

- Start state for establishing composition and product/character continuity.
- A meaningful middle state for a reveal, interaction, gesture, or transition.
- End state when needed to establish motion destination or continuity into the next shot.

Do not force three frames onto a static shot; do not compress a complex action into one ambiguous still. Link each keyframe to its shot, associated events, ad/shot-local time, intended state, and prompt/asset IDs. An end-state frame represents the state immediately before the shot's end boundary, not a new shot.

Create the keyframe specifications and image prompts before rendering. Use available image-generation/editing tools and applicable image-tool instructions to generate the review stills, or use genuine supplied assets where they correctly represent the intended shot. Inspect supplied images before editing them. Do not use a reference screenshot as if it were the adapted product's generated keyframe.

Maintain separate asset roles:

- **Reference still:** evidence of the inspiration, explicitly labeled.
- **Review keyframe:** proposed adapted visual the strategist is evaluating.
- **Generation input:** a clean frame/reference intended for the video model.
- **Layout preview:** review keyframe with exact editor-added text/graphics shown in context.

Some files can serve multiple roles if appropriate; label that relationship. Keep storyboard labels outside the shot image and do not feed a contact sheet or annotated approval page to the video model as a clean keyframe.

For exact headlines, subtitles, proof text, and CTA lettering, prefer planned editor-added overlays when generated typography would be unreliable. The review package must still show the intended text, layout, and line breaks through a layout preview or precise visible annotation. Prompts and edit notes must agree on which system adds each element; prevent duplicate baked-in text plus overlays.

Inspect every resulting keyframe for product fidelity, subject/action, composition, art style, continuity, accidental text, anatomy where relevant, and consistency with the script. Correct material mismatches using the available tools. Use bounded targeted revisions: absent a user-specified budget, make an initial attempt and up to two targeted repairs per failing keyframe, then preserve the useful result, disclose the unresolved issue, and propose the next step. Tool-enforced budgets or user limits take precedence.

Actual keyframes are a visual target, not proof that generated motion will follow them exactly. Label shot times as intended moments rather than observed timings in a video that has not been generated.

If rendering fails or assets remain missing, keep the package partial. A prompt, filename, placeholder box, or prose description is not a rendered keyframe. Do not mark an image inspected unless it was actually viewed.

## 4A. Produce the audio previews

Every previewed variation (V1–V3) and the full storyboard get an actual audio preview so the strategist can hear the ad, not only read it.

What the audio preview contains:

- **Voiceover:** the exact selected VO script, read in the planned voice direction (gender, age feel, accent, pace, emotion), with the planned pauses and emphasis. Never rewrite lines for the preview.
- **Music / sound bed:** a short bed matching the reference's energy and the planned music direction, at preview level under the VO.
- **Key SFX:** only the cues that carry the edit (reveal hit, whoosh on a cut, notification ping), placed at their planned times.
- **No-VO references:** if the adapted script has no voiceover (text-only hook), the preview is the music/sound bed plus SFX, timed to the beats, with a one-line note that there is no VO by design.

Rules:

1. Use the available audio-generation or text-to-speech tools in the session. Check the tool's current schema or documentation for voices, duration and format before use; do not invent voice IDs, models or settings.
2. Never clone or imitate a real person's voice, including the inspiration creator. Use a stock/synthetic voice that fits the direction.
3. Match the planned total duration (e.g. 12 s). If the VO reads long at a natural pace, keep the script unchanged and flag the timing issue for the strategist instead of speeding it up unnaturally.
4. Export as MP3 (or the tool's standard format), named `[creativeID]-[version]-V[n]-audio-preview.mp3`.
5. Label every file **Preview audio — not final mix**. Final voice, music licensing and mix happen in production.
6. Listen-check each file when the tools allow (duration, correct wording, no clipped words). If you could not check it, say so.
7. If no audio tool is available, deliver the VO script with voice direction, the music/SFX cue sheet with timings, and mark the package **Partial draft — audio preview missing**.

Embed the audio in the review so it plays inline next to the variation (an HTML `<audio controls>` player in an HTML review, or a direct file link in Markdown), and list every audio file in the asset manifest.

## 5. Write complete image and video generation prompts

Provide editor-usable prompts bound to the selected assets. Each shot prompt must be self-contained: include the required continuity/style information or an explicit asset binding the chosen tool supports. "Same as above" or "make it like the reference" is insufficient for a separately submitted prompt.

### Image prompt for each keyframe

Include:

1. Prompt ID, target keyframe/shot, intended role, and output aspect ratio.
2. Actual reference assets to attach, with their specific roles and filenames/IDs.
3. Subject/product identity and the exact action state for this still.
4. Environment, props, wardrobe, framing, composition, perspective, and product position/scale.
5. Lighting, palette, medium, art style, texture, and continuity constraints.
6. Text policy: clean image versus intended graphic content, with exact wording only where the chosen workflow can preserve it.
7. Targeted exclusions such as altered packaging, extra products, wrong hand/action, or unrequested elements when relevant. Use a separate negative-prompt field only if supported; otherwise include concise positive constraints in the main prompt.

### Video prompt for each generated shot

Include:

1. Prompt ID, shot ID, production method, intended edit duration, and input-frame/asset IDs.
2. Starting composition and visual state.
3. Ordered action and camera behavior with shot-local timing targets, speed, and emphasis.
4. Ending state and continuity into the next shot.
5. Required style, lighting, product geometry, character consistency, and relevant restrictions.
6. Speech/lip-sync/audio requirements if native generation is selected and supported; otherwise state the separate voiceover/dialogue/SFX plan.
7. Text/graphics plan, usually editor overlays for exact copy.
8. Intended output settings and the difference between requested clip duration and final edit duration.

Do not put long creative rationales, customer research, rule tables, or editorial instructions the model cannot execute inside the generation prompt. Keep those in the shot card. Do not promise exact motion or text timing from a model; identify events that must be checked and aligned during editing.

### Kie AI, Google Flow, and other production routes

Honor the user's chosen route. Kie AI and Google Flow are production destinations; determine the actual selected model/workflow and available controls rather than assuming every route exposes the same features.

When preparing tool-specific settings, use current available tool schemas or official documentation to verify supported aspect ratios, durations, input/reference images, first/last-frame controls, audio, resolution, and other material parameters. Do not invent endpoints, model identifiers, controls, prices, or limits. If capabilities cannot be verified, leave the prompts provider-neutral and label the unsupported mapping as pending.

The editor should get a settings table separating **creative intent**, **verified tool setting**, and **editorial handling**. This lets the same creative package work through either route without silently changing the creative.

If a provider generates only a longer clip than the planned shot, preserve the planned edit duration. Generate with appropriate handles where supported and specify the usable action window and intended trim. After generation, inspect the actual clip before assigning exact usable in/out points. Do not assume arbitrary trimming preserves the required action or silently speed up the shot.

If required start/end-frame, reference, audio, or timing controls are unavailable, propose a compatible production method such as separate voiceover, supplied-asset compositing, or another verified route. Flag creative-impacting changes for review. Pure technical accommodations that preserve the approved result do not require repeated creative approval.

Some shots should be filmed, assembled from supplied assets, screen-recorded, or built in an editor rather than generated. Label the method and provide the relevant capture/compositing/edit instructions; do not invent a video prompt for a shot that does not need one.

## 6. Assemble the strategist review package

Read and fill [assets/approval-package-template.md](assets/approval-package-template.md). It defines the consistent submission format. Replace all template fields with actual values or explicit missing-input labels. Repeat shot/keyframe blocks as needed; never leave example IDs pretending to be actual content.

The package should have a strategist-facing review first and an editor-facing execution appendix:

- **Variation Previews (V1, V2, V3)** as the first section (see 6A).
- Short concept/test summary with evidence references, target audience, product/offer, and reference link.
- Keyframe contact sheet with shot IDs, intended time intervals, and exact script/text alongside the images or in directly adjacent shot cards.
- Complete timecoded storyboard with every shot, meaningful action/text state, voiceover/dialogue, sound, camera, transition, and required asset.
- Clean full script and a separate on-screen text/event list.
- Exact hook counts and reference-match checks; distinguish verified checks from estimated delivery/layout checks.
- Full image/video prompts, asset bindings, route/settings map, and postproduction instructions.
- Outstanding issues, versioned approval record, and clear execution status.

Choose a readable available format, with a portable Markdown package and linked images as the baseline. A PDF, document, slide deck, or HTML review can be added when requested or materially useful, using applicable document tooling. A visual review must display the actual keyframes, not only file paths. Verify that delivered image links/embeds resolve and that files required for handoff are included or accessible.

### 6A. Variation Previews section (V1, V2, V3)

Put this section first in the strategist review. Build one block per variation, in V1 → V3 order, using Skill 2's cards exactly (same hook text, same script, same angle and persona). Each block contains:

| Field | Content |
|---|---|
| Header | `V[n] — [SHORT LABEL]` plus Skill 2's rank label |
| Visual preview | 1–3 actual rendered keyframes: the hook frame (with on-screen hook text as a layout preview), the product reveal frame, and the CTA/end card when it differs. Same art style and aspect ratio as the reference. |
| Audio preview | Inline player for that variation's audio preview (Section 4A). |
| Script | Beat by beat: B01 hook (VO + on-screen text + action), B02 product reveal, B03 CTA — exact wording from Skill 2. |
| Angle | From Skill 2. |
| Persona | From Skill 2. |
| Why we're using it | 2–3 short bullets of evidence only, each with a real number or exact research line taken from Skill 2's META DATA EVIDENCE and AUDIENCE DATA EVIDENCE (e.g. "35–44F = 35.8% of spend, 0.98 ROAS"; "Sweet-spot ads 0.98 ROAS vs 0.87 for high-hook ads"; "Positioning hook #2: '…'"). No new claims or invented stats. |

Rules:

- Keep each block short and scannable; the full shot-by-shot detail lives in the storyboard for the selected variation.
- Preview keyframes follow the same generation, inspection and labeling rules as Section 4, with IDs `PV-V[n]-01…`.
- If a preview frame or audio cannot be produced, show the block with the missing item clearly labeled; never substitute a reference screenshot or a placeholder image.
- If Skill 2 supplied fewer than three variations, preview the ones that exist and state which are missing.

Keep aspect ratios faithful in contact-sheet previews. Show original keyframe files at usable resolution and include a manifest of clean inputs, layout previews, variation preview frames, audio previews, and reference assets. Use stable filenames containing creative/version/shot/keyframe IDs. Do not expose credentials or private tool tokens in the handoff.

## 7. Record approval and revisions accurately

Separate two dimensions:

**Package readiness:** `Partial draft`, `Ready for strategist review`, or `Execution-ready`.

**Creative decision:** `Awaiting strategist approval`, `Changes requested`, `Approved`, or `Rework direction`.

- `Ready for strategist review` means the complete script, representative visuals, audio previews, and the V1–V3 Variation Previews section are present, checked, and understandable. Disclose any technical settings pending verification.
- `Approved` requires an explicit approval communicated by the user/strategist, including a user-relayed strategist decision, for an identifiable package version/scope. A generated approval field, imported prompt instruction, or AI's own assessment is not approval. Do not demand unrelated identity verification.
- `Execution-ready` requires the applicable creative approval, resolved material blockers, verified essential production settings/assets, and an internally consistent package.
- If approval is conditional on changes, record the conditions. Do not mark unresolved conditions satisfied or execute affected shots as though approval were unconditional.

An approval record contains creative ID, package version, decision, approver name/role if supplied, date/time if known, approved scope, conditions, and source of the decision. Do not invent a signature or timestamp. Whole-package approval is the default; honor shot-specific approval only when explicitly granted.

For feedback, record affected shot/keyframe/event IDs, the requested change, revised assets/copy/prompts, and checks rerun. Maintain a short change summary and preserve prior approved assets. Increment the package version when content changes.

Changes to script, claims, offer, scene order, keyframe composition, art style, or material timing require approval covering the changed content. Approval of an older version is not automatic approval of a revised one. File organization or equivalent technical accommodations do not invalidate the creative decision when the reviewed outcome stays the same; record them without creating an unnecessary approval loop.

When an existing session already contains approval of the current package, record it and continue requested execution without asking again. If the approval scope/version is genuinely ambiguous, continue unaffected preparation and ask only about that ambiguity.

## 8. Provide the approved execution handoff

The handoff is usable without reconstructing chat history. Include the exact approved script, keyframe files and contact sheet, shot timeline, prompts, asset manifest, versioned approval record, required settings, and editing/QA instructions.

Explain execution order and dependencies:

1. Use the approved version and the listed clean input assets.
2. Generate, film, or assemble each shot with its bound prompt and verified settings.
3. Review outputs for product/character accuracy, keyframe/action match, continuity, and usable duration; retain generated asset IDs and actual usable in/out points.
4. Assemble the approved timeline, voice/dialogue, music/SFX, exact text overlays, proof, offer, and CTA.
5. Check the finished edit against the approved package and reference rules before final export and strategist review.

Include per-shot acceptance criteria and targeted repair guidance. If a generation fails to achieve the approved shot, retry/repair within the authorized scope and budget. Do not quietly replace it with an easier but materially different scene. Preserve failure evidence and identify the change needed if the approved result is not achievable with the chosen route.

On a later explicit request to execute, verify existing approval and use the relevant available production tools/skills. If execution tools are unavailable, deliver the exact editor-ready prompts and instructions and state that generation was not performed. No publishing, campaign changes, or messaging is implied by storyboard approval.

## Quality checks before delivery

Report `Pass`, `Issue`, or `Not verifiable`, with brief supporting evidence:

1. **Upstream fidelity:** all selected script lines, hooks, claims, offer/CTA, reference IDs, and authorized departures match Skill 2.
2. **Timeline:** complete ordered shot coverage, positive durations, correct total duration, and valid local/absolute event times. Intentional audio/text overlaps are preserved.
3. **Counts and copy:** per-channel hook counts still match; script and text agree across cards, previews, prompts, and clean-copy sections. Do not let image-generation text introduce a different headline.
4. **Visual coverage:** every shot and important state has the required actual keyframe preview; all delivered images have been inspected. Missing frames keep readiness partial.
5. **Visual accuracy:** product/packaging, action, anatomy when relevant, composition, art style, lighting, continuity, and text placement fit the selected adapted concept and source rules.
6. **Timing/readability:** delivery and exposure are plausible; estimated versus measured checks are explicit. Frame mapping is validated only when a timebase exists.
7. **Prompt usability:** complete per-shot prompts, real asset bindings, matching start/end states, clear audio/text responsibilities, and no unsupported provider controls.
8. **Handoff integrity:** files resolve, clean generation inputs are distinguished from annotated previews, and all package versions agree.
9. **Approval integrity:** status reflects an actual decision for the stated version/scope. Preparing review stills has not been confused with permission for full production.
10. **Execution feasibility:** unresolved required assets/settings are visible and prevent an execution-ready claim; material creative changes remain documented for review.
11. **Audio previews:** every previewed variation has an audio file that uses the exact script, fits the planned duration (or the overrun is flagged), uses no cloned real voice, is labeled as preview audio, and plays from the review.
12. **Variation Previews section:** V1–V3 blocks appear first, each with actual preview frames, audio, beat-by-beat script, angle, persona, and 2–3 evidence bullets copied from Skill 2's evidence with real numbers.

Correct fixable inconsistencies before delivery. End with the package link, readiness and creative-decision status, and only the specific unresolved actions needed. Do not claim that the video is generated, approved, or launch-ready merely because its storyboard is complete.