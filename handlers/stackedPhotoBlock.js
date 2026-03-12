/**
 * Handler: stackedPhotoBlock → stackedPhotoBlock (Contentful)
 * Craft: heading, description, blockImage (asset IDs), imageLayout, callsToAction (object of { ctaText, ctaUrl })
 * Contentful: stackedPhotoBlock { blockId, blockName, heading, description, blockImage (Asset), imageLayout, callsToAction (cta[]) }
 */
import {
  upsertEntry,
  makeLink,
  upsertCta,
  parseCraftLink,
  resolveInternalUrl,
} from "../utils/contentfulHelpers.js";
import { getOrderedKeys } from "../utils/jsonOrder.js";

const LOCALE = "en-US";
const CONTENT_TYPE = "stackedPhotoBlock";

const IMAGE_LAYOUT_MAP = {
  "left-small": "Left, Small",
  "left-large": "Left, Large",
  "right-small": "Right, Small",
  "right-large": "Right, Large",
};

function normalizeImageLayout(value) {
  if (!value) return undefined;
  const key = String(value).toLowerCase().replace(/\s+/g, "-").replace(/,/g, "-");
  return IMAGE_LAYOUT_MAP[key] || value;
}

export async function createOrUpdateStackedPhotoBlock(env, blockData, assetMap = null) {
  if (!env) {
    return { sys: { id: `dry-run-stackedPhotoBlock-${blockData.blockId}` } };
  }

  try {
    await env.getContentType(CONTENT_TYPE);
  } catch (err) {
    console.warn(
      `   ⚠ stackedPhotoBlock not found in Contentful: ${err.message}. Skipping.`
    );
    return null;
  }

  const blockId = blockData.blockId;

  // Block image: only set when asset exists in assetMap to avoid notResolvable on publish
  let blockImageLink = null;
  const blockImageIds = Array.isArray(blockData.blockImage) ? blockData.blockImage : (blockData.blockImage ? [blockData.blockImage] : []);
  const craftAssetId = blockImageIds[0] != null ? String(blockImageIds[0]) : null;
  if (craftAssetId && assetMap?.get(craftAssetId)?.id) {
    blockImageLink = { sys: { type: "Link", linkType: "Asset", id: assetMap.get(craftAssetId).id } };
  } else if (blockImageIds.length > 0) {
    blockImageLink = null; // clear invalid link on update
  }

  // CTAs: create cta entries and link
  const ctaLinks = [];
  const callsToActionObj = blockData.callsToAction || {};
  const ctaIds = getOrderedKeys(blockData.blockSegment || "", callsToActionObj);

  for (const ctaId of ctaIds) {
    const ctaItem = callsToActionObj[ctaId];
    if (!ctaItem?.fields) continue;

    const linkInfo = parseCraftLink(ctaItem.fields.ctaUrl);
    let url = linkInfo.url || "";
    if (!url && linkInfo.linkedId) {
      url = resolveInternalUrl(linkInfo.linkedId) || "";
    }
    const label = ctaItem.fields.ctaText || linkInfo.label || "";

    const ctaEntry = await upsertCta(
      env,
      `stacked-${blockId}-${ctaId}`,
      label,
      url,
      true,
      linkInfo.linkedId ?? null
    );
    if (ctaEntry?.sys?.id) {
      ctaLinks.push(makeLink(ctaEntry.sys.id));
    }
  }

  const fields = {
    blockId: { [LOCALE]: String(blockId) },
    blockName: { [LOCALE]: blockData.blockName || blockData.heading || "Stacked Photo Block" },
    heading: { [LOCALE]: blockData.heading || "" },
    description: { [LOCALE]: blockData.description || "" },
    callsToAction: { [LOCALE]: ctaLinks },
  };

  const imageLayout = normalizeImageLayout(blockData.imageLayout);
  if (imageLayout) {
    fields.imageLayout = { [LOCALE]: imageLayout };
  }
  if (blockImageLink) {
    fields.blockImage = { [LOCALE]: blockImageLink };
  } else if (blockImageIds.length > 0) {
    fields.blockImage = { [LOCALE]: null };
  }

  return await upsertEntry(
    env,
    CONTENT_TYPE,
    `stackedphotoblock-${blockId}`,
    fields,
    true
  );
}
