import { convertHtmlToRichText } from "../utils/richText.js";
import { upsertCta, upsertAssetWrapper } from "../utils/contentfulHelpers.js";

const LOCALE = "en-US";
const CONTENT_TYPE = "bannerHero";

/* -----------------------------
   VARIANT MAPPING
 ------------------------------ */
function mapVariant(variation) {
  switch (variation) {
    case "bannerSlim":
    case "slimBanner":
      return "Banner Slim";
    case "bannerHero":
    case "bannerMediaCenter":
      return "Banner Media Center";
    case "bannerMediaRight":
      return "Banner Media Right";
    default:
      return "Banner Slim";
  }
}

/* -----------------------------
   MAIN UPSERT
 ------------------------------ */
export async function createOrUpdateHero(env, heroData, assetMap = null) {
  // 1. Verify Content Type exists
  try {
    await env.getContentType(CONTENT_TYPE);
  } catch (err) {
    console.warn(`   ⚠ Component "${CONTENT_TYPE}" not founded in contentful or error: ${err.message}. Skipping block ${heroData.blockId}.`);
    return null;
  }

  let existing;
  try {
    existing = await env.getEntries({
      content_type: CONTENT_TYPE,
      "fields.blockId": heroData.blockId,
      limit: 1
    });
  } catch (err) {
    console.error(`   🛑 Error fetching existing entries for "${CONTENT_TYPE}":`, err.message);
    return null;
  }

  /* -----------------------------
     MEDIA DETECTION HELPERS
  ------------------------------ */
  const findAssetId = (obj) => {
    if (!obj || typeof obj !== 'object') return null;
    if (Array.isArray(obj.image) && obj.image.length > 0) return obj.image[0];
    if (Array.isArray(obj.video) && obj.video.length > 0) return obj.video[0];
    for (const key of Object.keys(obj)) {
      const found = findAssetId(obj[key]);
      if (found) return found;
    }
    return null;
  };

  const assetId = findAssetId(heroData);
  const assetInfo = assetId ? (assetMap && assetMap.get(String(assetId))) : null;

  /* -----------------------------
     NESTED ENTRIES (CTA & ASSET)
  ------------------------------ */

  // 1. CTA
  let ctaEntry = null;
  const label = heroData.label || heroData.ctaText || "";
  const url = (() => {
    const rawLink = heroData.ctaLink;
    if (!rawLink) return "";
    if (typeof rawLink === "string" && rawLink.startsWith("{")) {
      try {
        const parsed = JSON.parse(rawLink);
        return parsed.linkedUrl || parsed.url || "";
      } catch (e) {
        return rawLink;
      }
    }
    return String(rawLink);
  })();

  if (label || url) {
    ctaEntry = await upsertCta(env, heroData.blockId, label, url);
  }

  // 2. ASSET WRAPPER
  let assetWrapper = null;
  if (assetId && assetInfo) {
    assetWrapper = await upsertAssetWrapper(env, heroData.blockId, assetInfo.id, assetInfo.mimeType, assetInfo.wistiaUrl);
  }

  /* -----------------------------
     BANNER HERO FIELDS
  ------------------------------ */
  const fields = {
    blockId: { [LOCALE]: heroData.blockId },
    blockName: { [LOCALE]: heroData.blockName || heroData.heading || "Banner Hero" },
    layoutVariant: { [LOCALE]: mapVariant(heroData.variation) },
    heading: { [LOCALE]: heroData.heading || "" },
    description: { [LOCALE]: await convertHtmlToRichText(env, heroData.body || "") },
    removeShadow: { [LOCALE]: !!heroData.removeShadow }
  };

  if (ctaEntry) {
    fields.cta = {
      [LOCALE]: {
        sys: { type: "Link", linkType: "Entry", id: ctaEntry.sys.id }
      }
    };
  }

  if (assetWrapper) {
    fields.addAsset = {
      [LOCALE]: {
        sys: { type: "Link", linkType: "Entry", id: assetWrapper.sys.id }
      }
    };
  }

  let entry;
  if (existing.items.length) {
    entry = existing.items[0];
    console.log("🔄 Updating existing hero:", entry.sys.id);
    entry.fields = fields;
    entry = await entry.update();
    entry = await entry.publish();
  } else {
    console.log("✨ Creating new hero");
    entry = await env.createEntry(CONTENT_TYPE, { fields });
    entry = await entry.publish();
  }

  return entry;
}
