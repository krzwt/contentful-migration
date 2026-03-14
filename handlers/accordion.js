/**
 * Handler: accordion → accordion
 * Craft: headingSection, body250, accordion (nested groups with rows: heading, body)
 * Contentful: accordion { blockId, blockName, sectionTitle, description, addAccordion: [accordionItem] }
 */
import {
  upsertEntry,
  upsertCta,
  upsertSectionTitle,
  makeLink,
  upsertAssetWrapper,
  ensureAssetPublished,
  parseCraftLink,
  resolveInternalUrl,
} from "../utils/contentfulHelpers.js";
import { getOrderedKeys } from "../utils/jsonOrder.js";
import { convertHtmlToRichText } from "../utils/richText.js";

const LOCALE = "en-US";
const CONTENT_TYPE = "accordion";

export async function createOrUpdateAccordion(
  env,
  blockData,
  assetMap = null,
  summary = null,
) {
  try {
    await env.getContentType(CONTENT_TYPE);
  } catch (err) {
    console.warn(
      `   ⚠ Content type "${CONTENT_TYPE}" not found: ${err.message}. Skipping.`,
    );
    return null;
  }

  const blockId = blockData.blockId;
  const heading = blockData.headingSection || blockData.heading || "";

  const titleEntry = await upsertSectionTitle(env, blockId, heading);

  const accordionRefs = [];
  const accData = blockData.accordion || {};

  const orderedGIds = getOrderedKeys(blockData.blockSegment, accData);
  for (const aId of orderedGIds) {
    const accGroup = accData[aId];
    if (typeof accGroup !== "object" || !accGroup.fields) continue;

    // Extract group segment
    const gIdx = blockData.blockSegment.indexOf(`"${aId}":`);
    const nextGId = orderedGIds[orderedGIds.indexOf(aId) + 1];
    const nextGIdx = nextGId
      ? blockData.blockSegment.indexOf(`"${nextGId}":`)
      : blockData.blockSegment.length;
    const groupSegment = blockData.blockSegment.substring(gIdx, nextGIdx);

    const rows = accGroup.fields?.rows || {};
    const orderedRowIds = getOrderedKeys(groupSegment, rows);

    for (const rowId of orderedRowIds) {
      const row = rows[rowId];
      if (typeof row !== "object" || !row.fields) continue;
      const f = row.fields;

      // Basic Fields
      const alignment = f.contentAlignment ? "Right" : "Left";
      const itemFields = {
        heading: { [LOCALE]: f.heading || "" },
        description: {
          [LOCALE]: await convertHtmlToRichText(env, f.body || ""),
        },
        contentAlignment: { [LOCALE]: alignment },
      };

      // Asset (Image/Video)
      if (f.asset?.length && assetMap) {
        const craftAssetId = String(f.asset[0]);
        const assetInfo = assetMap.get(craftAssetId);

        if (assetInfo) {
          const assetWrapper = await upsertAssetWrapper(
            env,
            craftAssetId,
            assetInfo.id,
            assetInfo.mimeType,
            assetInfo.wistiaUrl,
            assetInfo.title,
          );
          if (assetWrapper) {
            itemFields.addAsset = { [LOCALE]: makeLink(assetWrapper.sys.id) };
          }
        }
      }

      // CTA
      if (f.ctaLink) {
        const linkInfo = parseCraftLink(f.ctaLink);
        let label = f.linkText || linkInfo.label || "";
        let url = linkInfo.url;

        if (!url && linkInfo.linkedId) {
          url = resolveInternalUrl(linkInfo.linkedId) || "";
        }

        if (url || linkInfo.linkedId) {
          const ctaEntry = await upsertCta(
            env,
            `acc-${rowId}`,
            label,
            url,
            true,
            linkInfo.linkedId,
          );
          if (ctaEntry) {
            itemFields.cta = { [LOCALE]: makeLink(ctaEntry.sys.id) };
          }
        }
      }

      const itemEntry = await upsertEntry(
        env,
        "accordionItem",
        `acc-${rowId}`,
        itemFields,
      );
      if (itemEntry) accordionRefs.push(makeLink(itemEntry.sys.id));
    }
  }

  const fields = {
    blockId: { [LOCALE]: blockId },
    blockName: { [LOCALE]: blockData.blockName || heading || "Accordion" },
  };
  if (titleEntry)
    fields.sectionTitle = { [LOCALE]: makeLink(titleEntry.sys.id) };
  if (blockData.body250) fields.description = { [LOCALE]: blockData.body250 };
  if (accordionRefs.length) fields.addAccordion = { [LOCALE]: accordionRefs };

  return await upsertEntry(env, CONTENT_TYPE, `accordion-${blockId}`, fields);
}
