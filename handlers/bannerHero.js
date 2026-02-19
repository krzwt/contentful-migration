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

    case "bannerMediaRight":
      return "Banner Media Right";

    case "bannerMediaCenter":
      return "Banner Media Center";

    case "bannerHero":
      return "Banner Slim";

    default:
      console.warn("⚠ Unknown variation:", variation);
      return "Banner Slim";
  }
}

/* -----------------------------
   MAIN UPSERT
------------------------------ */
export async function createOrUpdateHero(env, heroData, assetMap = null) {
  // 1. Verify Content Type exists
  let contentType;
  try {
    contentType = await env.getContentType(CONTENT_TYPE);
  } catch (err) {
    console.warn(`   ⚠ Component "${CONTENT_TYPE}" not founded in contentful. Skipping block ${heroData.blockId}.`);
    return null;
  }

  // 2. Verify Fields exist
  const expectedFields = ["blockId", "blockName", "layoutVariant", "heading", "description", "mediaType", "mediaAssetImageVideo", "videoUrl", "removeShadow", "ctaText", "ctaLink"];
  const ctFields = contentType.fields.map(f => f.id);
  const missingFields = expectedFields.filter(f => !ctFields.includes(f));

  if (missingFields.length > 0) {
    console.warn(`   ⚠ Field(s) not founded in contentful for "${CONTENT_TYPE}": ${missingFields.join(", ")}`);
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
  const detectVideoPresence = (obj) => {
    if (!obj || typeof obj !== 'object') return false;
    if (obj.videoUrl || (Array.isArray(obj.video) && obj.video.length > 0)) return true;
    if (obj.type === "video") return true;
    return Object.values(obj).some(val => typeof val === 'object' && detectVideoPresence(val));
  };

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
  const isVideoFound = detectVideoPresence(heroData);
  const isJsonAsset = assetInfo?.mimeType === "application/json";

  const fields = {
    blockId: { [LOCALE]: heroData.blockId },
    blockName: { [LOCALE]: heroData.blockName || "" },
    layoutVariant: {
      [LOCALE]: mapVariant(heroData.variation)
    },
    heading: {
      [LOCALE]: heroData.heading || "Untitled Hero"
    },
    description: {
      [LOCALE]: heroData.body || ""
    },
    mediaType: {
      [LOCALE]: isJsonAsset ? "JSON" : (isVideoFound ? "Video" : (heroData.mediaType || "Image"))
    },
    videoUrl: {
      [LOCALE]: heroData.videoUrl || ""
    },
    removeShadow: {
      [LOCALE]: !!heroData.removeShadow
    },
    ctaText: {
      [LOCALE]: heroData.label || heroData.ctaText || ""
    },
    ctaLink: {
      [LOCALE]: (() => {
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
      })()
    }
  };

  /* -----------------------------
     MEDIA ASSET LINKING
  ------------------------------ */
  if (assetId) {
    if (assetInfo && assetInfo.id) {
      const isValidMime = assetInfo.mimeType.startsWith("image/") ||
        assetInfo.mimeType.startsWith("video/") ||
        assetInfo.mimeType === "application/json";

      if (isValidMime) {
        console.log(`   🔗 Linking Asset: ${assetId} -> ${assetInfo.id} (${assetInfo.mimeType})`);
        fields.mediaAssetImageVideo = {
          [LOCALE]: {
            sys: {
              type: "Link",
              linkType: "Asset",
              id: assetInfo.id
            }
          }
        };
      } else {
        console.warn(`   ⚠ Skipping Asset: ${assetId} - Invalid MimeType: ${assetInfo.mimeType}`);
        fields.mediaAssetImageVideo = { [LOCALE]: null };
      }
    } else {
      console.warn(`   ⚠ Missing Contentful Asset ID for source ID: ${assetId}`);
      fields.mediaAssetImageVideo = { [LOCALE]: null };
    }
  } else {
    fields.mediaAssetImageVideo = { [LOCALE]: null };
  }

  let entry;

  if (existing.items.length) {
    entry = existing.items[0];
    console.log("🔄 Updating existing hero:", entry.sys.id);

    entry.fields = { ...entry.fields, ...fields };
    entry = await entry.update();
    entry = await entry.publish();
  } else {
    console.log("✨ Creating new hero");

    entry = await env.createEntry(CONTENT_TYPE, {
      fields
    });

    entry = await entry.publish();
  }

  return entry;
}
