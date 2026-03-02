/**
 * Handler: cardGrid → cardGridBlock
 * Craft: headingSection, subheading, cardTheme, cardGrid (nested groups with cards)
 * Contentful: cardGridBlock { blockId, blockName, sectionTitle, description, cardTheme, gridLayout, addCard: [iconGridItem] }
 */
import {
  upsertEntry,
  upsertSectionTitle,
  upsertCta,
  makeLink,
  parseCraftLink,
} from "../utils/contentfulHelpers.js";
import { getOrderedKeys } from "../utils/jsonOrder.js";

const LOCALE = "en-US";
const CONTENT_TYPE = "cardGridBlock";

// Craft cardTheme → Contentful cardTheme mapping
const THEME_MAP = { image: "Light", dark: "Dark", light: "Light" };

export async function createOrUpdateCardGrid(env, blockData, assetMap = null) {
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

  // Parse nested card items
  const cardRefs = [];
  const cardGridData = blockData.cardGrid || {};

  const orderedGroupIds = getOrderedKeys(blockData.blockSegment, cardGridData);
  for (const gId of orderedGroupIds) {
    const group = cardGridData[gId];
    if (typeof group !== "object" || !group.fields) continue;

    // Extract group segment
    const gIdx = blockData.blockSegment.indexOf(`"${gId}":`);
    const nextGId = orderedGroupIds[orderedGroupIds.indexOf(gId) + 1];
    const nextGIdx = nextGId
      ? blockData.blockSegment.indexOf(`"${nextGId}":`)
      : blockData.blockSegment.length;
    const groupSegment = blockData.blockSegment.substring(gIdx, nextGIdx);

    const cards = group.fields?.cards || {};
    const orderedCardIds = getOrderedKeys(groupSegment, cards);

    for (const cId of orderedCardIds) {
      const card = cards[cId];
      if (typeof card !== "object" || !card.fields) continue;
      const f = card.fields;

      const itemTitle = await upsertSectionTitle(
        env,
        `cg-${cId}`,
        f.description || "",
      );

      let ctaEntry = null;
      const link = parseCraftLink(f.ctaLink);
      if (link.url || f.ctaLabel || link.linkedId) {
        ctaEntry = await upsertCta(
          env,
          `cg-${cId}`,
          f.ctaLabel || link.label || "",
          link.url,
          true,
          link.linkedId,
        );
      }

      const itemFields = {
        description: { [LOCALE]: f.description || "" },
      };
      if (itemTitle)
        itemFields.title = { [LOCALE]: makeLink(itemTitle.sys.id) };
      if (ctaEntry) itemFields.cta = { [LOCALE]: makeLink(ctaEntry.sys.id) };

      if (f.image?.length && assetMap) {
        const assetInfo = assetMap.get(String(f.image[0]));
        if (assetInfo) {
          itemFields.icon = {
            [LOCALE]: {
              sys: { type: "Link", linkType: "Asset", id: assetInfo.id },
            },
          };
        }
      }

      const itemEntry = await upsertEntry(
        env,
        "iconGridItem",
        `cgitem-${cId}`,
        itemFields,
      );
      if (itemEntry) cardRefs.push(makeLink(itemEntry.sys.id));
    }
  }

  const fields = {
    blockId: { [LOCALE]: blockId },
    blockName: { [LOCALE]: blockData.blockName || heading || "Card Grid" },
    cardTheme: {
      [LOCALE]: THEME_MAP[(blockData.cardTheme || "").toLowerCase()] || "Light",
    },
  };
  if (titleEntry)
    fields.sectionTitle = { [LOCALE]: makeLink(titleEntry.sys.id) };
  if (blockData.subheading)
    fields.description = { [LOCALE]: blockData.subheading };
  if (cardRefs.length) fields.addCard = { [LOCALE]: cardRefs };

  return await upsertEntry(env, CONTENT_TYPE, `cardgrid-${blockId}`, fields);
}
