# Creative Hub Meta Format Contract

Last researched: 2026-05-23

This document locks the payload contract for the Creative Hub launch format work before implementation. The goal is to keep the current working launch path stable while adding newer Meta format behavior behind explicit modes and validation.

## Sources Checked

- Meta Java Business SDK 25.0.1 `AdAccount.APIRequestCreateAdCreative`: exposes `asset_feed_spec`, `contextual_multi_ads`, `degrees_of_freedom_spec`, `format_transformation_spec`, and `object_story_spec` create parameters.
  https://javadoc.io/static/com.facebook.business.sdk/facebook-java-business-sdk/25.0.1/com/facebook/ads/sdk/AdAccount.APIRequestCreateAdCreative.html
- Meta Java Business SDK 24.0.1 `AdAccount.APIRequestCreateAdSet`: exposes `is_dynamic_creative` on ad set creation.
  https://javadoc.io/static/com.facebook.business.sdk/facebook-java-business-sdk/24.0.1/com/facebook/ads/sdk/AdAccount.APIRequestCreateAdSet.html
- Meta Java Business SDK package index: confirms current SDK classes for `AdCreativeContextualMultiAds`, `AdCreativeDegreesOfFreedomSpec`, `AdCreativeFeaturesSpec`, `AdCreativeFormatTransformationSpec`, and `AdDynamicCreative`.
  https://javadoc.io/static/com.facebook.business.sdk/facebook-java-business-sdk/24.0.1/com/facebook/ads/sdk/package-summary.html
- RestFB `AdAssetFeedSpec`: lists the asset feed fields that matter for copy/media combinatorics: `bodies`, `titles`, `descriptions`, `images`, `videos`, `link_urls`, `call_to_action_types`, `ad_formats`, and `optimization_type`.
  https://restfb.com/javadoc/src-html/com/restfb/types/ads/AdAssetFeedSpec.html
- Swipe Insight April 2026 report: Ads Manager now presents Manual Upload mainly as `Single image or video` and `Carousel`; `Single image or video` can allow up to 10 media files and Format Display Options.
  https://web.swipeinsight.app/posts/meta-replaces-flexible-and-collection-formats-with-new-format-display-options-23676
- AdManage 2026 guide: reports Flexible and Collection moved out of the classic top-level format picker and into newer display-option behavior.
  https://admanage.ai/blog/meta-ad-formats-explained
- Metricool Flexible Ads guide: describes Flexible as the Dynamic Creative replacement in Ads Manager, where Meta chooses single image, video, or carousel renderings from uploaded media/text options.
  https://metricool.com/flexible-ads-meta/

## Definitions

### Object Story Spec

`object_story_spec` is the stable single-render creative body. It contains the page/Instagram identity and either:

- `video_data` for one video asset, or
- `link_data` for one image/link asset.

This is the safest format for one uploaded creative -> one Meta ad.

### Asset Feed Spec

`asset_feed_spec` is Meta's asset pool field. It can contain copy options, media options, links, CTAs, format hints, and optimization type. It is used by multiple systems:

- copy variants inside a mostly normal ad,
- placement asset customization,
- carousel/flexible-like asset pools,
- true dynamic creative.

Because the same field is overloaded, the exact field set matters. Adding media arrays (`images`, `videos`) is much more likely to trigger dynamic/flexible behavior than adding only copy arrays (`bodies`, `titles`, `descriptions`).

### Dynamic Creative

Dynamic Creative is an ad set-level mode. The ad set must be created or already configured with `is_dynamic_creative=true`. A full dynamic ad creative can then use a complete `asset_feed_spec` including media, text, links, CTAs, and format options.

If a full dynamic creative payload is sent into a non-dynamic ad set, Meta returns the known mismatch error:

`Dynamic Creative ads can only be created under Dynamic Creative Ad Sets`

### Format Display Options

Format Display Options are the newer Ads Manager UI behavior that appears to replace the older visible Flexible/Collection choices. In the UI, `Single image or video` may accept multiple media files and Meta may render single-media, multi-element, or collection-like variations depending on account/objective/placement.

The API surface seems related to `asset_feed_spec`, `format_transformation_spec`, and `degrees_of_freedom_spec`, but Meta's public SDK method list does not by itself prove a stable non-dynamic payload shape for multiple media in a normal ad set. This must be treated as a guarded mode until verified with a live preflight test.

## Launch Modes

### Mode 1: `single_per_creative`

Status: safe, current default.

Intent:

- One selected Creative Hub creative becomes one Meta ad.
- Each ad has one image or one video.
- Multiple selected creatives create multiple ads.

Allowed with:

- existing normal ad sets,
- new normal ad sets,
- existing/new campaigns.

Ad creative payload:

```json
{
  "name": "Creative name Creative",
  "url_tags": "...",
  "object_story_spec": {
    "page_id": "...",
    "instagram_user_id": "...",
    "video_data": {
      "video_id": "...",
      "title": "...",
      "message": "...",
      "link_description": "...",
      "call_to_action": {
        "type": "LEARN_MORE",
        "value": { "link": "https://example.com" }
      },
      "image_hash": "optional-thumbnail-hash"
    }
  }
}
```

For image ads, `object_story_spec.link_data.image_hash` is used instead of `video_data.video_id`.

Optional copy options:

If the user selects multiple primary texts/headlines/descriptions, add copy-only `asset_feed_spec`:

```json
{
  "bodies": [{ "text": "Primary text 1" }, { "text": "Primary text 2" }],
  "titles": [{ "text": "Headline 1" }, { "text": "Headline 2" }],
  "descriptions": [{ "text": "Description 1" }],
  "optimization_type": "DEGREES_OF_FREEDOM"
}
```

Important rule:

Do not add `images`, `videos`, `ad_formats`, `link_urls`, or `call_to_action_types` to this copy-only asset feed in a normal ad set. Those fields can push the payload toward dynamic/flexible behavior.

### Mode 2: `single_format_media_options`

Status: investigational, should be feature-gated.

Intent:

- A batch of selected creatives becomes one Meta ad.
- User-facing wording matches Ads Manager's newer "Single image or video" behavior with multiple media options.
- Meta may show single media or format-display variants.

Likely API direction:

```json
{
  "object_story_spec": {
    "page_id": "...",
    "instagram_user_id": "..."
  },
  "asset_feed_spec": {
    "bodies": [{ "text": "..." }],
    "titles": [{ "text": "..." }],
    "descriptions": [{ "text": "..." }],
    "images": [{ "hash": "..." }],
    "videos": [{ "video_id": "..." }],
    "link_urls": [{ "website_url": "https://example.com" }],
    "call_to_action_types": ["LEARN_MORE"],
    "ad_formats": ["SINGLE_IMAGE", "SINGLE_VIDEO"],
    "optimization_type": "DEGREES_OF_FREEDOM"
  }
}
```

Risk:

This shape previously triggered dynamic-creative mismatch in our app when sent to non-dynamic ad sets. Ads Manager may have account-specific or newer internal parameters for this UI behavior. Do not ship this as the default path without a live preflight.

Implementation rule:

For v1, only expose this mode if:

- campaign objective is compatible,
- ad set is newly created by us, or preflight confirms the existing ad set accepts this payload,
- selected batch has at least two media assets,
- all videos are fully processed before creative creation,
- the API dry-run/preflight creates or validates a paused creative successfully.

Fallback rule:

If Meta rejects the multiple-media payload, do not silently fall back to multiple separate ads. Return a clear validation error and keep the current launch unchanged.

### Mode 3: `dynamic_creative`

Status: implementable with guardrails.

Intent:

- User intentionally creates a Dynamic Creative ad set.
- One dynamic ad contains a full asset pool of media/copy/link/CTA options.

Allowed with:

- new ad sets created by our app with `is_dynamic_creative=true`,
- existing ad sets only if preflight fetch confirms `is_dynamic_creative=true`.

Ad set payload addition:

```json
{
  "is_dynamic_creative": "true"
}
```

Ad creative payload:

```json
{
  "name": "Batch name Creative",
  "url_tags": "...",
  "object_story_spec": {
    "page_id": "...",
    "instagram_user_id": "..."
  },
  "asset_feed_spec": {
    "bodies": [{ "text": "Primary text 1" }],
    "titles": [{ "text": "Headline 1" }],
    "descriptions": [{ "text": "Description 1" }],
    "images": [{ "hash": "..." }],
    "videos": [{ "video_id": "..." }],
    "link_urls": [{ "website_url": "https://example.com" }],
    "call_to_action_types": ["LEARN_MORE"],
    "optimization_type": "DEGREES_OF_FREEDOM"
  }
}
```

Hard validation:

- Dynamic creative must not be offered for existing non-dynamic ad sets.
- If an ad set is dynamic, do not create normal non-dynamic ads inside it.
- Prefer one dynamic ad per dynamic ad set/batch unless live tests prove multiple dynamic ads in one dynamic ad set are accepted for our objective/account.

### Mode 4: `carousel`

Status: defer until after modes 1-3.

Intent:

- One ad with 2-10 ordered cards.
- Each card can have its own image/video/headline/link.

Likely payload options:

- `object_story_spec.link_data.child_attachments`, or
- `asset_feed_spec` with carousel/card fields.

Implementation should be separate from dynamic creative and format display options because carousel has different preview, ordering, card URL, and placement constraints.

## Multi-Advertiser Ads Opt-Out

Current finding:

- SDK create-ad-creative exposes `contextual_multi_ads` as a top-level create parameter, not as a member of `degrees_of_freedom_spec.creative_features_spec`.
- Putting `contextual_multi_ads` under `creative_features_spec` caused Meta error: key must be one of the allowed creative feature keys.

Contract:

```json
{
  "contextual_multi_ads": {
    "enroll_status": "OPT_OUT"
  }
}
```

Risk:

Some accounts/API versions may still reject this top-level parameter. Our backend must keep the existing fallback that removes `contextual_multi_ads` only if Meta rejects that field. This should not block ad creation.

## Preflight Requirements Before Building New Modes

Add a preflight function before any new format launch path:

1. Fetch target ad set fields: `id,name,is_dynamic_creative,campaign_id,account_id`.
2. Confirm selected campaign/ad set account matches the ad account endpoint.
3. For videos, poll Meta video status and block launch while status is still processing.
4. Validate format mode:
   - `single_per_creative`: always allowed.
   - `single_format_media_options`: allowed only when a feature flag and live payload preflight pass.
   - `dynamic_creative`: allowed only for dynamic ad sets.
5. Validate media count:
   - single: exactly one media per ad,
   - media options: two to ten media per ad,
   - dynamic: at least two total assets or two text options.
6. Validate text arrays are arrays and capped to Meta-safe limits.
7. Validate thumbnails exist for videos before ad creative creation.

## Recommended Implementation Order

1. Add config enum only; default to `single_per_creative`.
2. Add Launch Config UI section.
3. Add Review summary and validation text.
4. Refactor backend into three explicit builders:
   - `buildSingleCreativeBody`
   - `buildCopyOptionsAssetFeedSpec`
   - `buildDynamicCreativeBody`
5. Add preflight endpoint/helper.
6. Implement `dynamic_creative` first because the ad set requirement is explicit (`is_dynamic_creative=true`).
7. Implement `single_format_media_options` only after one live dev-account preflight confirms the multiple-media non-dynamic payload shape.

## Current Decision

For the next coding step, implement only the config/UI/validation shell. Do not change the current backend launch behavior yet.

Backend support should be added in this order:

1. preserve current `single_per_creative`,
2. add explicit `dynamic_creative` with new dynamic ad sets,
3. then test and add `single_format_media_options` behind a feature flag.
