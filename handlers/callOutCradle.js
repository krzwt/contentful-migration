/**
 * Handler: calloutCradle (Craft) → callOutCradle (Contentful)
 * Craft: layout, heading (text), description, callToAction (single { label, ctaUrl }), calloutImage (asset IDs)
 * Contentful: callOutCradle { blockId, blockName, layout, heading (Link sectionTitle), description, callToAction (Link cta), calloutImage (Asset) }
 */
import {
  upsertEntry,
  makeLink,
  upsertCta,
  upsertSectionTitle,
  parseCraftLink,
  resolveInternalUrl,
} from "../utils/contentfulHelpers.js";
import { getOrderedKeys } from "../utils/jsonOrder.js";

const LOCALE = "en-US";
const CONTENT_TYPE = "callOutCradle";

function normalizeLayout(value) {
  if (!value) return undefined;
  const v = String(value).toLowerCase();
  return v === "right" ? "Right" : v === "left" ? "Left" : value;
}

export async function createOrUpdateCallOutCradle(env, blockData, assetMap = null) {
  if (!env) {
    return { sys: { id: `dry-run-callOutCradle-${blockData.blockId}` } };
  }

  try {
    await env.getContentType(CONTENT_TYPE);
  } catch (err) {
    console.warn(
      `   ⚠ callOutCradle not found in Contentful: ${err.message}. Skipping.`
    );
    return null;
  }

  const blockId = blockData.blockId;

  // Heading: Contentful expects Link to sectionTitle → create sectionTitle from Craft heading text
  let headingLink = null;
  const headingText = blockData.heading;
  if (headingText) {
    const titleEntry = await upsertSectionTitle(env, blockId, headingText);
    if (titleEntry?.sys?.id) {
      headingLink = makeLink(titleEntry.sys.id);
    }
  }

  // Call To Action: single CTA (Craft has object with one entry)
  let ctaLink = null;
  const ctaObj = blockData.callToAction || {};
  const ctaIds = getOrderedKeys(blockData.blockSegment || "", ctaObj);
  const firstCtaId = ctaIds[0];
  if (firstCtaId) {
    const ctaItem = ctaObj[firstCtaId];
    if (ctaItem?.fields) {
      const linkInfo = parseCraftLink(ctaItem.fields.ctaUrl);
      let url = linkInfo.url || "";
      if (!url && linkInfo.linkedId) {
        url = resolveInternalUrl(linkInfo.linkedId) || "";
      }
      const label = ctaItem.fields.label || linkInfo.label || "";
      const ctaEntry = await upsertCta(
        env,
        `coc-${blockId}-${firstCtaId}`,
        label,
        url,
        true,
        linkInfo.linkedId ?? null
      );
      if (ctaEntry?.sys?.id) {
        ctaLink = makeLink(ctaEntry.sys.id);
      }
    }
  }

  // Callout Image: single asset link
  let calloutImageLink = null;
  const imageIds = blockData.calloutImage;
  if (Array.isArray(imageIds) && imageIds.length > 0 && assetMap) {
    const craftAssetId = String(imageIds[0]);
    const assetInfo = assetMap.get(craftAssetId);
    if (assetInfo?.id) {
      calloutImageLink = { sys: { type: "Link", linkType: "Asset", id: assetInfo.id } };
    }
  }

  const fields = {
    blockId: { [LOCALE]: String(blockId) },
    blockName: { [LOCALE]: blockData.blockName || blockData.heading || "Call Out Cradle" },
    description: { [LOCALE]: blockData.description || "" },
  };

  const layout = normalizeLayout(blockData.layout);
  if (layout) {
    fields.layout = { [LOCALE]: layout };
  }
  if (headingLink) {
    fields.heading = { [LOCALE]: headingLink };
  }
  if (ctaLink) {
    fields.callToAction = { [LOCALE]: ctaLink };
  }
  if (calloutImageLink) {
    fields.calloutImage = { [LOCALE]: calloutImageLink };
  }

  return await upsertEntry(
    env,
    CONTENT_TYPE,
    `calloutcradle-${blockId}`,
    fields,
    true
  );
}
