# Borrow: Full Structure (close copy)

The strategist wants the competitor's video rebuilt for our product. This is also the **default** whenever they share a competitor or inspiration video and just ask for a brief ("give me a brief for this ad", "make this for our product") without naming a specific part.

**Default similarity is CLOSE.** The finished video should feel like the same ad made for our product: same beats in the same order, same timing, same visual style, same sentence shapes and rhythm. Strategists pick these ads because the structure is proven, so every change we make is a risk that has to earn its place. Only change what has to change.

Switch to **LOOSE** (their structure, our winner's angle and voice) only when the strategist asks for it ("keep our winner's angle", "make it more our style", "use our persona").

## What stays and what changes (close mode)

| Keep the same | Change for our product | Never carry over |
|---|---|---|
| Beat order and number of beats | Product name, look, packaging | Their brand name, logo, product shots |
| Beat timing (within ~10%) | How the product is used (their "2–3 drops in your navel" becomes our real usage) | Claims on our "can't say" list |
| Shots per beat and visual style (e.g. 3D X-ray skeleton look) | Symptoms, pains, benefits that aren't true for our product, swapped for the closest true ones (prefer customer words from the data) | Any claim or result not true for our product |
| Sentence structure, line length (word count ±15%), rhetorical devices (negation ×2 → positive list ×3, question pivot) | Proof, numbers, offer, CTA (only from our data) | Their unique slogan or trademarked phrase |
| Hook mechanism and hook word count | Visual details that show *their* product, redrawn to show ours | Their creators' faces or voice |
| Caption style, music feel, pacing | | |

## The core method: keep their sentence, swap their problem for ours

Our product often solves a **different problem** from theirs (they sell a bloating oil, we sell a nervous-system product). Close copy then doesn't mean keeping their words. It means **keeping every sentence's frame and swapping only the problem-specific words for our equivalents**, in the same position. Wherever they mention their pain, we mention ours. Wherever they list their symptoms, we list ours, in the same count and order.

| Their line | Frame (kept) | Their slot → our slot | Our line |
|---|---|---|---|
| "Always Feeling **BLOATED**?" | Always Feeling [PAIN]? | bloated → dysregulated | "Always Feeling **DYSREGULATED**?" |
| "Every time you **eat**, it starts with a little **bloating**." | Every time you [TRIGGER], it starts with a little [FIRST SYMPTOM]. | eat → get stressed · bloating → tension | "Every time you **get stressed**, it starts with a little **tension**." |
| "Your **jeans feel tighter**. Your **stomach feels rock hard**." | Your [SYMPTOM 1]. Your [SYMPTOM 2]. | body symptoms → ours, same escalation | "Your **shoulders feel tighter**. Your **chest feels heavy**." |
| "Just **2 to 3 drops in your navel** every day…" | Just [USAGE] every day… | their usage → our real usage | "Just **5 minutes of this routine** every day…" |

Rules:
- **Slots to swap:** pain, trigger, symptoms, life impact, cause, mechanism, product, usage, benefits, outcome, proof, offer, CTA. Everything else (sentence frame, rhythm, punctuation, CAPS on the same word, the number of items in a list, the question or negation pattern) stays as theirs.
- **Same position, same weight.** Their CAPS word becomes our CAPS word. A 3-item list stays 3 items. A short punchy symptom stays short and punchy.
- **Fill slots from our data first:** the customer words, pains, and benefits in the product file. Then use plain truthful wording. Never invent symptoms or results.
- If their problem *is* our problem (we also sell for bloating), the slots stay the same and the line can stay word for word.
- Rewrite more than the slots only when the frame itself can't be true for us or is on the can't-say list. Mark that row ⚠️.

## Steps

### 1. Full breakdown
From `breakdown.md`: run the video analysis script, then the beat table (every line quoted), hook card, all shot details, format summary.

### 2. Data card
From `product-data.md`. In close mode, the data mainly supplies *true substitutes*: our pain, triggers, symptoms, real usage, real benefits, customer words, proof, offer, CTA, and the "can't say" list. It does not change the structure.

### 2b. Pain map: their problem → our problem
Before converting lines, map every problem-specific slot in their ad to ours, one row per slot. This fixes the vocabulary so the whole script stays consistent (the pain is "dysregulated" everywhere, not three different words):

| Slot | Theirs (with beat) | Ours | Source |
|---|---|---|---|
| Main pain | bloated (B01) | dysregulated | 📊 product file: main pain |
| Trigger | eating (B01) | stress | 📊 pains |
| Symptoms ×5 (B02, escalating) | jeans tighter → stomach rock hard → gas trapped → burping → heavy | shoulders tight → chest heavy → racing thoughts → snapping at people → wired but tired | 📊 customer words |
| Life impact ×3 (B03) | … | … | |
| Hidden cause (B05) | … | … | |
| Usage (B06) | 2–3 drops in navel | … | 📊 product facts |
| Benefits (B07) | … | … | |

Keep the same **number** of items as theirs in every list slot. If our data has fewer true items, mark the gap `[NEED]` rather than padding with invented ones.

### 3. Close conversion table
The centrepiece, mirroring the beat table so the strategist can compare row by row:

| Beat | Start–end (s) | Shots | Theirs | Ours: text / VO | Ours: visual | Changed? |
|---|---|---|---|---|---|---|
| B01 | 0.000–2.703 | S01 | Headline "Always Feeling BLOATED?" + VO "Every time you eat, it starts with a little bloating." | Headline "Always Feeling **DYSREGULATED**?" + VO "Every time you **get stressed**, it starts with a little **tension**." | Same split screen: hunched, tense skeleton with a red glow along the spine vs. upright, calm skeleton | ✏️ pain slots swapped (pain map) |
| B06 | 33.300–40.607 | S17–S19 | VO "Just 2 to 3 drops in your navel every day…" Dropper over navel → glowing path | VO "Just **5 minutes of this routine** every day…" | Same glowing path, travelling along the nervous system instead of the gut | ✏️ usage swapped to ours |

**Bold the swapped words** in the "Ours" column so the strategist can see exactly what changed and that everything else is theirs.

- **Changed?** says `✅ same`, `✏️ [what changed + why in ≤8 words]`, or `⚠️ [needs a call → Q#]`. Combine them when a row has both (`✏️ usage swapped · ⚠️ Q2`).
- **CTA:** use our standard CTA from the data file, because it's the one proven for us, even if it runs longer than their end beat. Stretch the last beat and note the new total length in one line. Only make it a Q-call if the data file has no standard CTA.
- **Their claims that aren't in our data:** in health, supplement, beauty, finance, or other regulated categories, any benefit claim that isn't in our data file (even a soft one like "helps support healthy digestion") becomes a Q-call. In other categories, generic, harmless lines can stay.
- Keep the VO/text word count close to theirs line by line, so the timing still works.
- If a beat can't be filled honestly (e.g. they show a clinical study we don't have), keep the beat's job and fill it with the nearest true thing, marked ⚠️. Or use `[NEED: proof]`.

### 4. Options
Keep this short. In close mode, the conversion table is the main deliverable:
- **Hooks H1–H5:** H1 = their hook with only the pain slots swapped (from the pain map). H2–H5 = same mechanism and word count, each leaning on a different pain or customer phrase from our data.
- **Body:** B1 = the close conversion above. Optionally add **B2 = data-tuned**: same structure, but symptoms and benefits re-ranked toward what our data says converts. Show only the rows that differ from B1.
- Visual notes stay "same as their S##" unless a change is needed.
- No separate bridge table: in close mode the bridge is their own transition beat, converted in the table above.
- **Q-calls (`Q1…`):** every ⚠️ row gets one line in a `⚠️ Calls needed` table (`ID | Question | Options a/b`), each option short and with the safer choice first.

### 5. Stop and ask for picks
Hooks (one, or several for V1/V2/V3), B1 or B2, plus answers to any ⚠️ rows. Then wait.

### 6. Brief
Use `editor-brief-template.md`. Under "Copy from the inspiration", say clearly that this is a **close remake**, list the visual signature, and tell the editor to match the inspiration's timing shot for shot (link + timestamps). Under "Do NOT copy", list their brand, product shots, creators, music track, and any swapped claim.
