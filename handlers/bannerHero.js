import { convertHtmlToRichText } from "../utils/richText.js";
import { upsertCta, upsertAssetWrapper, makeLink, upsertEntry } from "../utils/contentfulHelpers.js";

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
  if (!env) {
    return { sys: { id: `dry-run-hero-${heroData.blockId}` } };
  }
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

  // 3. FORM SUPPORT
  // For page 1372587 (Block 1372588), the user specifically wants to link "SRA Trial Form - Legacy Form"
  const SITE_FORM_ID = "3aenoKrEbPbjQsmmAR7jfF"; // Manually created "SRA Trial Form - Legacy Form"

  if (heroData.blockId === "1372588") {
    console.log(`   🧪 Applying SRA Trial Form link for block 1372588`);

    // 3.1 Create/Update the sraTrialForm entry that wraps the siteForm
    // Note: Schema check shows mainBannerForm expects "embedFormsCpt". 
    // We try to use that if possible, or fall back to draft linking if requested.
    const sraFormFields = {
      formName: { [LOCALE]: "SRA Trial Form - Legacy Form (Wrapper)" },
      // selectForm: { [LOCALE]: makeLink(SITE_FORM_ID) } // Legacy field?
    };

    // If SITE_FORM_ID exists, we could use it, but since it's missing, let's be safe.
    let sraFormEntry = null;
    try {
      sraFormEntry = await upsertEntry(
        env,
        "embedFormsCpt", // Changed from "sraTrialForm" to match bannerHero schema
        `form-sra-${heroData.blockId}`,
        sraFormFields
      );
    } catch (err) {
      console.warn(`   ⚠ Could not create/update SRA Form Entry: ${err.message}`);
    }

    if (sraFormEntry && sraFormEntry.sys.publishedVersion) {
      fields.mainBannerForm = {
        [LOCALE]: {
          sys: { type: "Link", linkType: "Entry", id: sraFormEntry.sys.id }
        }
      };
    } else {
      console.warn(`   ⚠️ Skipping broken SRA Form link for block 1372588 (Entry not published or missing)`);
      fields.mainBannerForm = { [LOCALE]: null }; // Explicitly clear if broken
    }
  } else if (heroData.mainBannerForm && heroData.mainBannerForm.length > 0) {
    // Generic logic for other forms if found in source
    console.log(`   📝 Found form in source for block ${heroData.blockId} (implementation pending)`);
  }

  let entry;
  if (existing.items.length) {
    entry = existing.items[0];
    console.log("🔄 Updating existing hero:", entry.sys.id);
    entry.fields = {
      ...entry.fields,
      ...fields
    };
    entry = await entry.update();
    entry = await entry.publish();
  } else {
    console.log("✨ Creating new hero");
    entry = await env.createEntry(CONTENT_TYPE, { fields });
    entry = await entry.publish();
  }

  return entry;
}
