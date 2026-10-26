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

Generic lines that are true for our product (e.g. "Always feeling bloated?") can stay word for word, because that's what "highly similar" means. Rewrite only lines that are brand-specific, untrue for us, or banned.

## Steps

### 1. Full breakdown
From `breakdown.md`: beat table, hook card, all shot details, format summary.

### 2. Data card
From `product-data.md`. In close mode, the data mainly supplies *true substitutes*: our real usage, our real benefits, customer words for pains, proof, offer, CTA, and the "can't say" list. It does not change the structure.

### 3. Close conversion table
The centrepiece, mirroring the beat table so the strategist can compare row by row:

| Beat | Start–end (s) | Shots | Theirs | Ours: text / VO | Ours: visual | Changed? |
|---|---|---|---|---|---|---|
| B01 | 0.000–2.703 | S01 | Headline "Always Feeling BLOATED?" + VO "Every time you eat, it starts with a little bloating." | Headline "Always Feeling BLOATED?" + VO "Every time you eat, it starts with a little bloating." | Same split-screen X-ray skeleton | ✅ same |
| B06 | 33.300–40.607 | S17–S19 | VO "Just 2 to 3 drops in your navel every day…" Dropper over navel → glowing path | VO "Just one capsule after dinner…" | Capsule enters stomach → same glowing path → thumbs-up | ✏️ usage swapped: our product is a capsule |

- **Changed?** says `✅ same`, `✏️ [what changed + why in ≤8 words]`, or `⚠️ [needs a call → Q#]`. Combine them when a row has both (`✏️ usage swapped · ⚠️ Q2`).
- **CTA:** use our standard CTA from the data file, because it's the one proven for us, even if it runs longer than their end beat. Stretch the last beat and note the new total length in one line. Only make it a Q-call if the data file has no standard CTA.
- **Their claims that aren't in our data:** in health, supplement, beauty, finance, or other regulated categories, any benefit claim that isn't in our data file (even a soft one like "helps support healthy digestion") becomes a Q-call. In other categories, generic, harmless lines can stay.
- Keep the VO/text word count close to theirs line by line, so the timing still works.
- If a beat can't be filled honestly (e.g. they show a clinical study we don't have), keep the beat's job and fill it with the nearest true thing, marked ⚠️. Or use `[NEED: proof]`.

### 4. Options
Keep this short. In close mode, the conversion table is the main deliverable:
- **Hooks H1–H5:** H1 = closest to their hook (often the same line, if it's true for us). H2–H5 = same mechanism and word count, each leaning on a different pain or customer phrase from our data.
- **Body:** B1 = the close conversion above. Optionally add **B2 = data-tuned**: same structure, but symptoms and benefits re-ranked toward what our data says converts. Show only the rows that differ from B1.
- Visual notes stay "same as their S##" unless a change is needed.
- No separate bridge table: in close mode the bridge is their own transition beat, converted in the table above.
- **Q-calls (`Q1…`):** every ⚠️ row gets one line in a `⚠️ Calls needed` table (`ID | Question | Options a/b`), each option short and with the safer choice first.

### 5. Stop and ask for picks
Hooks (one, or several for V1/V2/V3), B1 or B2, plus answers to any ⚠️ rows. Then wait.

### 6. Brief
Use `editor-brief-template.md`. Under "Copy from the inspiration", say clearly that this is a **close remake**, list the visual signature, and tell the editor to match the inspiration's timing shot for shot (link + timestamps). Under "Do NOT copy", list their brand, product shots, creators, music track, and any swapped claim.
