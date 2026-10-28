---
name: "data-informed-adaptation"
description: "Analyze live Meta Ads performance data and audience research, then adapt an inspiration video's script and visuals for a product. Outputs two simplified markdown tables directly in chat: a 5-variation card-layout ranking table and a data appendix."
---

# Data-Informed Adaptation

## Purpose and workflow position

Act as the media buyer and creative adaptation specialist. Pull the account's real performance data **for the one product being adapted**, analyze what is working and why, then use that evidence plus audience research and the Skill 1 inspiration breakdown to write the next batch of ad copy and visual concepts.

This is Skill 2 of a three-stage workflow:

1. **Inspiration Breakdown (Skill 1):** source timeline, hook specifications, shot cards, art direction, Reference Rules Sheet.
2. **This skill:** pulls live Meta Ads data for the target product only, diagnoses it, adapts the inspiration into 5 ranked variations, and delivers everything as two clean markdown tables typed directly in chat.
3. **Storyboard and Approval (Skill 3):** converts the adapted concept into keyframes, prompts, and an approval package.

**Output rule: type both tables directly in the chat as markdown. Do not create any file, spreadsheet, or attachment.**

---

## Inputs

| Input | Source | What to extract |
|---|---|---|
| Meta Ads data | Meta Ads MCP tools — product-scoped campaigns only; ad-level, age×gender | Spend, sales, ROAS, CPS, hook %, hold % per ad; age×gender breakdown |
| Skill 1 Inspiration Breakdown | Supplied file or output | Source beats, hook specs, hook word counts per channel, art direction, Reference Rules |
| Audience Research | Supplied file (AvatarIQ or equivalent) | Segments, pains, desires, buying triggers, objections, exact customer language |
| Product facts | User-supplied | Correct product, features, offer, price, CTA, available proof, assets |
| ClickUp scripts | ClickUp MCP — search for relevant INS IDs | Read all related script tasks before writing variations |

**Always output 5 variations (V1–V5).** V1 = best data-backed option. V5 = fifth-best option. All five must be real data-backed creative angles — never placeholders.

**Time windows:** always pull 30-day, 14-day, and 7-day numbers from Meta Ads. Use a consistent reporting end date.

**Definitions (state at top of output):**
- Hook rate = `video_p25_watched_actions ÷ impressions × 100`
- Hold rate = `video_thruplay_watched_actions ÷ impressions × 100`
- Sweet spot: hook rate 25–35% + strong hold rate. High hook rate (40%+) does NOT predict profitability.

---

## Step 0 — Scope the data to ONE product (mandatory, before any analysis)

An ad account can hold several products. Every number in the output must come only from the product being adapted. Never report account-wide totals.

1. Pull the campaign list for the account (campaign level, 30d, with spend).
2. Classify every campaign with spend as **IN** (target product) or **OUT** (other product), using the product code in the campaign name (e.g. KMH = Kids Mental Health Bundle; CKW = Calm Kids Workbook) and the ad names inside it.
3. A campaign with no product tag is IN only if its ads are clearly that product's creatives (e.g. KM- prefixed ads); otherwise OUT. If still unclear, ask the user before continuing.
4. Build the IN campaign ID list. Pull ad-level data with `campaign_id` included and keep only ads whose campaign is IN. Compute Section A totals from IN campaigns only. Compute Section B (age×gender) by pulling breakdowns at campaign level and summing IN campaigns only.
5. Fetch every page (use `limit` up to 1000 and a spend > 0 filter; follow `next_cursor`). Never report from a partial page.
6. Flag campaigns whose pixel/tracking looks broken (e.g. old-pixel campaigns with near-zero ROAS despite strong watch metrics) so their ROAS is not read as creative failure.
7. Print a one-line scope note under the header: product, IN campaigns, OUT campaigns excluded.

---

## Step 1 — Pull the Meta Ads data (product-scoped)

Use Meta Ads MCP tools to retrieve, for IN campaigns only:

1. Spend, sales/purchases, ROAS, and cost per sale for 30d, 14d, and 7d windows.
2. Age × gender breakdown: spend share, sales share, ROAS, cost per sale per segment.
3. Ad-level data for all active and recently tested creatives: name, spend, sales, ROAS, hook rate, hold rate.

**Precision rules:**
- Derive rates only when numerator and denominator are both available.
- Zero purchases with positive spend = CPA undefined; label it.
- Do not average ROAS across ads without weighting by spend.

---

## Step 2 — Read ClickUp scripts

Search ClickUp for all relevant INS IDs related to the inspiration reference. Read each script task. Note which angles and personas have already been tested. Flag any not yet in Meta data.

---

## Step 3 — Analyze audience research

For each segment: pain, desire, buying trigger, main objection, exact customer language. Identify which segments are supported by the product's Meta age×gender data vs. never briefed.

---

## Step 4 — Rank 5 variations by data

Using evidence from Steps 0–3, define 5 distinct creative variations. Rank them V1 (best) → V5 (fifth-best) based on:
- Which angle/persona has the best ROAS evidence in the product's Meta data
- Which pain point matches the audience buying behavior
- Which hook approach hits the 25–35% hook rate + strong hold sweet spot
- Which sub-avatars are untested gaps with audience data support

For each variation define:
- **ANGLE** — persuasion approach (e.g., Problem-Aware Regret, Social Proof, Before/After)
- **PERSONA** — specific sub-avatar from audience research
- **PAIN POINT** — the exact pain being targeted
- **HOOK TEXT** — full hook line (spoken VO for B01), token-counted to match Skill 1 reference
- **B01 HOOK (0:00–0:04)** — what the creator says and does in the hook beat
- **B02 PRODUCT REVEAL (0:04–0:10)** — how the product is introduced and demonstrated
- **B03 CTA (0:10–0:12)** — closing call to action line
- **META DATA EVIDENCE** — specific ROAS, hook rate, hold rate, or spend data from this product's ads that supports this choice
- **AUDIENCE DATA EVIDENCE** — specific segment pain/desire/language from research that supports this choice
- **WHY THIS WINS** — one clear reason this ranks where it does
- **WHAT TO AVOID** — one specific mistake to not make with this variation

**Hook word-count contract:**
- Split on whitespace; count tokens with at least one letter or numeral
- Contractions, hyphenated terms, numeric expressions = one token
- Standalone punctuation/emoji = zero words
- Match the Skill 1 reference spoken token count exactly
- Show: reference text + token list + count → adapted text + token list + count → Match ✅ or Mismatch ❌

**Dual-channel hook rule:** if Skill 1 specifies simultaneous VO + text-on-screen from frame 1 (dual-channel hook), B01 must describe both channels firing at the same time from frame 1.

---

## Required output format

**Type both tables directly in the chat as markdown. Do not create any file, spreadsheet, or attachment.**

Begin with a one-line header, then the scope line:
```
**Account:** [ID] · **Product:** [name] · **Windows:** 30d / 14d / 7d · **Hook rate:** p25÷imp×100 · **Hold rate:** thruplay÷imp×100
**Scope:** [product] only — IN: [campaigns] · OUT (excluded): [campaigns]
```

---

### TABLE 1 — VARIATION RANKING

Output each variation as its own card block. Each card = 6 markdown table rows. Cards are separated by a blank line. Repeat the structure for all 5 variations, V1 through V5.

**Rank label by position:** #1 BEST BET · #2 STRONG · #3 SOLID · #4 TEST · #5 BACKUP

**Card structure (repeat for each variation):**

```
| #[N] [RANK LABEL] — V[N]: [SHORT LABEL IN CAPS] |
|---|

| ANGLE | PERSONA | PAIN POINT |
|---|---|---|
| [angle] | [persona] | [pain point] |

| HOOK TEXT — [n] tokens |
|---|
| [full hook line] |

| B01 HOOK (0:00–0:04) | B02 PRODUCT REVEAL (0:04–0:10) | B03 CTA (0:10–0:12) |
|---|---|---|
| [hook beat: VO + action] | [product reveal copy and action] | [CTA line] |

| META DATA EVIDENCE | AUDIENCE DATA EVIDENCE |
|---|---|
| [specific ROAS / hook% / hold% / spend number] | [specific segment / pain / exact language] |

| WHY THIS WINS | WHAT TO AVOID |
|---|---|
| [one clear reason for this rank] | [one specific mistake to not make] |
```

---

### TABLE 2 — DATA APPENDIX

Three sections, each as a clean markdown table. Label each section clearly. All numbers are product-scoped.

**SECTION A — PRODUCT SNAPSHOT**

| Window | Spend | Sales | ROAS | Cost/Sale | Trend |
|---|---|---|---|---|---|
| 30d | | | | | |
| 14d | | | | | |
| 7d | | | | | |

**SECTION B — WHO ACTUALLY BUYS**

| Segment | Spend Share | ROAS | What We Brief | Status |
|---|---|---|---|---|
| [age/gender] | [%] | [x.xx] | [persona briefed on ads] | 🎯 ON / 🟡 GAP / ❌ LOSING |

Status key: 🎯 ON = briefed persona matches buyer · 🟡 GAP = untested audience with buying signal · ❌ LOSING = spend going to non-buyers

**SECTION C — EVERY CONCEPT TESTED**

| Concept | Angle | Spend | ROAS | Hook% / Hold% | Verdict | Key Reason |
|---|---|---|---|---|---|---|
| [name] | [angle] | [$] | [x.xx] | [%] / [%] | 🏆✅🟡⚪❌ | [one line] |

Verdict codes: 🏆 winner keep running · ✅ profitable expand · 🟡 promising needs read · ⚪ starved/no read · ❌ losing pause

---

## Quality checks before typing output

1. Step 0 done: every number comes only from the target product's campaigns; excluded campaigns are named in the scope line.
2. All pages of ad data fetched — no partial-page reporting.
3. All 5 variations have real data or audience evidence — no placeholders.
4. Hook token count verified per variation against Skill 1 reference spoken count.
5. Section A numbers come from Meta Ads MCP data exactly — nothing invented.
6. Section B includes every age×gender segment with spend, plus untested gaps marked 🟡 GAP.
7. Section C covers every ad of the product with a verdict and key reason.
8. No file created. Both tables typed directly in chat.
9. Dual-channel hook verified: if Skill 1 specifies simultaneous VO + text-on-screen from frame 1, B01 describes both channels.
10. No invented stats, fake scarcity, or fabricated social proof in any variation.
11. ClickUp scripts read before writing any variation — if unavailable, flag with `> Gap: ClickUp not read`.