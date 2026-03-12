# test-resources-cpt.json – Component mapping review

Resources CPT migration uses `COMPONENTS[block.type]` from `registry.js` for each block in `mixedContent`. Below: every **block type** in the test file and whether it has a mapping.

## Contentful Resources CPT (Resource Content)

Allowed section types in schema: `simpleList`, `stackedPhotoBlock`, `pageSection`, `callOutCradle`, `callout`, `checkmarkList`, `codeBlock`, `comparisonChart`, `contentBlocks`, `coverPhotoSection`, `detailedList`, `events`, `image`, `partnersLogosBlock`, `quote`, `resources`, `tombstones`, `twoColumnBlockLists`, `footnotes`, `callsToAction`.

---

## Status by Craft type (from test-resources-cpt.json)

| # | Craft `type` in mixedContent | In registry? | Contentful type (schema) | Notes |
|---|-------------------------------|--------------|---------------------------|--------|
| 1 | **contentBlock** | ✅ Yes | contentBlocks | Mapped → createOrUpdateContentBlock |
| 2 | **quote** | ✅ Yes | quote | Mapped → createOrUpdateQuote |
| 3 | **logoList** | ✅ Yes | (partnersLogosBlock?) | Mapped → createOrUpdateLogoList |
| 4 | **callout** | ✅ Yes | callout | Mapped → createOrUpdateCalloutBar |
| 5 | **reviewTombstones** | ❌ No | tombstones? | Needs handler or alias to tombstones |
| 6 | **simpleList** | ✅ Yes | simpleList | Mapped → createOrUpdateSimpleList |
| 7 | **stackedPhotoBlock** | ✅ Yes | stackedPhotoBlock | Mapped → createOrUpdateStackedPhotoBlock |
| 8 | **pageSection** | ❌ No | pageSection | Needs handler |
| 9 | **calloutCradle** | ✅ Yes | callOutCradle | Mapped → createOrUpdateCallOutCradle |
| 10 | **callsToAction** | ✅ Yes | callsToAction | Mapped → createOrUpdateCallsToActionBlock |
| 11 | **checkmarkList** | ❌ No | checkmarkList | Needs handler |
| 12 | **codeBlock** | ❌ No | codeBlock | Needs handler |
| 13 | **comparisonChart** | ❌ No | comparisonChart | Needs handler |
| 14 | **coverPhotoSection** | ❌ No | coverPhotoSection | Needs handler |
| 15 | **detailedList** | ❌ No | detailedList | Needs handler |
| 16 | **events** | ❌ No | events | Needs handler |
| 17 | **image** | ❌ No | image | Needs handler (or map to mediaBlock if same model) |
| 18 | **resources** | ❌ No | resources | Needs handler (resource cards block) |
| 19 | **text** | ❌ No | — | Not in Contentful schema; may map to a rich-text block type if one exists |
| 20 | **tombstones** | ❌ No | tombstones | Needs handler (reviews.js is for “reviews” block, not tombstones) |
| 21 | **twoColumnBlockLists** | ❌ No | twoColumnBlockLists | Needs handler |
| 22 | **video** | ❌ No | — | Not in schema; may map to image/mediaBlock with video |
| 23 | **footnotes** | ❌ No | footnotes | Needs handler |

---

## Summary

- **Mapped (8):** contentBlock, quote, logoList, callout, simpleList, stackedPhotoBlock, calloutCradle, callsToAction  
- **Not mapped (15):** reviewTombstones, pageSection, checkmarkList, codeBlock, comparisonChart, coverPhotoSection, detailedList, events, image, resources, text, tombstones, twoColumnBlockLists, video, footnotes  

To migrate all test components you need to add **handlers (and optionally mappings)** for the 15 unmapped types, and ensure the Resources CPT field name matches the handler (code uses `resourceContent`; confirm it matches the Contentful field, e.g. `sections` or `resourceContent`).

## Run test resource (single entry)

```bash
node index.js --id 2506067
```

Only blocks with a registry entry will be migrated; the rest will log `skipping modular block: "type" (no mapping)`.
