# Meta API: Multiple Media in a Single Ad

This feature uses **`asset_feed_spec`** in the Ad Creative API — the API equivalent of Meta's multi-select media picker (up to 10 media per ad).

---

## Core Concept

Instead of attaching one media to a creative, you pass an `asset_feed_spec` object with **arrays** of images/videos. Meta automatically tests and serves the best performer.

---

## Step 1 — Upload Media First

### Images
```http
POST /act_{ad_account_id}/adimages
```
```json
{ "filename": "<binary_file>" }
```
→ Returns `hash` per image. **Store these hashes.**

### Videos
```http
POST /act_{ad_account_id}/advideos
```
```json
{ "source": "<binary_file>" }
```
→ Returns `video_id`. **Store these IDs.**

---

## Step 2 — Create Campaign with Dynamic Creative Enabled

```http
POST /act_{ad_account_id}/campaigns
```
```json
{
  "name": "My Campaign",
  "objective": "OUTCOME_SALES",
  "special_ad_categories": [],
  "is_dynamic_creative": true
}
```

> ⚠️ `is_dynamic_creative: true` is **required**. Without it, `asset_feed_spec` with multiple media will not work.

---

## Step 3 — Create Ad Set (Normal)

```http
POST /act_{ad_account_id}/adsets
```
```json
{
  "campaign_id": "your_campaign_id",
  "optimization_goal": "OFFSITE_CONVERSIONS",
  "billing_event": "IMPRESSIONS",
  "bid_amount": 100,
  "daily_budget": 5000,
  "targeting": { ... },
  "status": "PAUSED"
}
```

No special changes needed here.

---

## Step 4 — Create Ad Creative with `asset_feed_spec`

```http
POST /act_{ad_account_id}/adcreatives
```
```json
{
  "name": "Multi-Media Creative",
  "asset_feed_spec": {
    "images": [
      { "hash": "abc123hash1" },
      { "hash": "abc123hash2" },
      { "hash": "abc123hash3" }
    ],
    "videos": [
      {
        "video_id": "123456789",
        "thumbnail_hash": "thumbhash1"
      },
      {
        "video_id": "987654321",
        "thumbnail_hash": "thumbhash2"
      }
    ],
    "bodies": [
      { "text": "Your primary ad body text here" }
    ],
    "titles": [
      { "text": "Your headline" }
    ],
    "descriptions": [
      { "text": "Optional description" }
    ],
    "call_to_action_types": ["LEARN_MORE"],
    "link_urls": [
      {
        "website_url": "https://yourstore.com/product",
        "display_url": "yourstore.com"
      }
    ],
    "ad_formats": ["SINGLE_IMAGE", "SINGLE_VIDEO"]
  }
}
```

### Field Reference

| Field | Description |
|---|---|
| `images[]` | Array of image hashes from Step 1 (up to 10 total media) |
| `videos[]` | Array of video IDs with required thumbnail hashes |
| `bodies[]` | Primary text — can pass multiple for text testing too |
| `titles[]` | Headline text |
| `descriptions[]` | Optional description below headline |
| `call_to_action_types[]` | CTA button type e.g. `LEARN_MORE`, `SHOP_NOW` |
| `link_urls[]` | Destination URL and display URL |
| `ad_formats[]` | Reflect what media you are providing — see note below |

> **`ad_formats` values:**
> - Images only → `["SINGLE_IMAGE"]`
> - Videos only → `["SINGLE_VIDEO"]`
> - Mixed → `["SINGLE_IMAGE", "SINGLE_VIDEO"]`

---

## Step 5 — Create the Ad

```http
POST /act_{ad_account_id}/ads
```
```json
{
  "name": "My Multi-Media Ad",
  "adset_id": "your_adset_id",
  "creative": {
    "creative_id": "your_creative_id"
  },
  "status": "PAUSED"
}
```

---

## Full Flow Summary

```
1. Upload Images  →  collect hashes[]
2. Upload Videos  →  collect video_ids[]
3. Create Campaign  (is_dynamic_creative: true)
4. Create Ad Set   (normal, no changes)
5. Create Creative  (asset_feed_spec with hashes + video_ids)
6. Create Ad       (reference creative_id)
```

---

## Important Rules

1. **Total media limit = 10** (images + videos combined)
2. **Video thumbnails are required** — every video entry must include a `thumbnail_hash`
3. **`is_dynamic_creative: true`** must be set at the campaign level — non-negotiable
4. **Image hashes** come from the `adimages` endpoint — do NOT use image URLs
5. **`ad_formats`** must match what you are actually providing in the creative
6. **Do not mix** Carousel format with `asset_feed_spec` — they are separate ad types
