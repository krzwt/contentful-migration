import { convertHtmlToRichText } from "../utils/richText.js";
import { upsertCta, upsertAssetWrapper, makeLink, upsertEntry } from "../utils/contentfulHelpers.js";
import { createOrUpdateFormComponent } from "./formComponent.js";

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
    assetWrapper = await upsertAssetWrapper(env, heroData.blockId, assetInfo.id, assetInfo.mimeType, assetInfo.wistiaUrl, assetInfo.title);
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
  const GENERIC_FORM_VERSION_TO_EMBED_ENTRYID = {
    // Craft "Contact Form" banner variant → ContactSalesForm embed
    bannerContactForm: "ContactSalesForm",
  };

  if (heroData.blockId === "1372588") {
    console.log(`   🧪 Applying SRA Trial Form link for block 1372588`);

    // mainBannerForm must link to formComponent; formComponent.selectForm links to embedFormsCpt.
    const SRA_EMBED_ENTRY_ID = "form-sra-1372588";
    const sraFormFields = {
      entryId: { [LOCALE]: SRA_EMBED_ENTRY_ID },
      formName: { [LOCALE]: "SRA Trial Form - Legacy Form (Wrapper)" },
    };

    let sraEmbedEntry = null;
    try {
      sraEmbedEntry = await upsertEntry(
        env,
        "embedFormsCpt",
        SRA_EMBED_ENTRY_ID,
        sraFormFields,
        true,
      );
    } catch (err) {
      console.warn(`   ⚠ Could not create/update SRA embed form: ${err.message}`);
    }

    if (sraEmbedEntry?.sys?.id) {
      const formComponentEntry = await createOrUpdateFormComponent(env, {
        blockId: heroData.blockId,
        blockName: "SRA Trial Form - Legacy Form",
        selectFormEntryId: SRA_EMBED_ENTRY_ID,
        embedSource: "contentful",
        lang: "EN",
      });
      if (formComponentEntry?.sys?.id) {
        fields.mainBannerForm = {
          [LOCALE]: { sys: { type: "Link", linkType: "Entry", id: formComponentEntry.sys.id } },
        };
      } else {
        console.warn(`   ⚠️ Could not create formComponent for SRA; clearing mainBannerForm.`);
        fields.mainBannerForm = { [LOCALE]: null };
      }
    } else {
      console.warn(`   ⚠️ SRA embed form not ready; clearing mainBannerForm.`);
      fields.mainBannerForm = { [LOCALE]: null };
    }
  } else if (heroData.mainBannerForm && typeof heroData.mainBannerForm === "object") {
    // Generic logic for other forms: create a formComponent and link it here.
    console.log(
      `   📝 Found form in source for block ${heroData.blockId} – creating Form Component for bannerHero.mainBannerForm`,
    );

    const formBlocks = heroData.mainBannerForm;
    const formIds = Object.keys(formBlocks || {});

    for (const fId of formIds) {
      const fBlock = formBlocks[fId];
      if (!fBlock || !fBlock.enabled) continue;
      const fFields = fBlock.fields || {};

      try {
        const mappedEmbedEntryId =
          GENERIC_FORM_VERSION_TO_EMBED_ENTRYID[fFields.version || ""] || null;

        const formEntry = await createOrUpdateFormComponent(env, {
          blockId: fId,
          blockName: fFields.blockName || "Main Banner Form",
          redirectUrl: fFields.redirectUrl,
          salesforceCampaignId: fFields.salesforceCampaignId,
          product: fFields.product,
          // Standalone pages are currently EN-only
          lang: "EN",
          // Select the appropriate embedFormsCpt by entryId, based on Craft form version
          selectFormEntryId: mappedEmbedEntryId,
        });

        if (formEntry && formEntry.sys && formEntry.sys.id) {
          fields.mainBannerForm = {
            [LOCALE]: {
              sys: { type: "Link", linkType: "Entry", id: formEntry.sys.id },
            },
          };
          break;
        }
      } catch (err) {
        console.warn(
          `   ⚠ Error creating banner main form component for block ${fId}: ${err.message}`,
        );
      }
    }
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
