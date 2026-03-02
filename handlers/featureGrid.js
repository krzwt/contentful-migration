/**
 * Handler: featureGrid → featureGrid
 * Craft: headingSmall, subheadingSmall, featureGrid (nested items with heading, body, icon, ctaLink)
 * Contentful: featureGrid { blockId, blockName, sectionTitle, description, cta, addItem: [featureGridItem] }
 */
import {
  upsertEntry,
  upsertSectionTitle,
  upsertCta,
  makeLink,
  parseCraftLink,
  ensureAssetPublished,
} from "../utils/contentfulHelpers.js";
import { convertHtmlToRichText } from "../utils/richText.js";

const LOCALE = "en-US";
const CONTENT_TYPE = "featureGrid";

export async function createOrUpdateFeatureGrid(
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
  const heading = blockData.headingSmall || blockData.headingSection || "";

  const titleEntry = await upsertSectionTitle(env, blockId, heading);

  // CTA from top-level
  let ctaEntry = null;
  const link = parseCraftLink(blockData.ctaLink);
  if (link.url || blockData.label25 || link.linkedId) {
    ctaEntry = await upsertCta(
      env,
      blockId,
      blockData.label25 || link.label || "",
      link.url,
      true,
      link.linkedId,
    );
  }

  // Create featureGridItem entries
  const itemRefs = [];
  const gridData = blockData.featureGrid || {};

  for (const [gId, grid] of Object.entries(gridData)) {
    if (typeof grid !== "object" || !grid.fields) continue;
    const f = grid.fields;

    const itemTitle = await upsertSectionTitle(
      env,
      `fg-${gId}`,
      f.heading || "",
    );

    let itemCta = null;
    const itemLink = parseCraftLink(f.ctaLink);
    if (itemLink.url || f.ctaLabel || itemLink.linkedId) {
      itemCta = await upsertCta(
        env,
        `fg-${gId}`,
        f.ctaLabel || itemLink.label || "",
        itemLink.url,
        true,
        itemLink.linkedId,
      );
    }

    const itemFields = {
      cardName: { [LOCALE]: f.heading || `Feature ${gId}` },
      description: { [LOCALE]: await convertHtmlToRichText(env, f.body || "") },
    };
    if (itemTitle) itemFields.title = { [LOCALE]: makeLink(itemTitle.sys.id) };
    if (itemCta) itemFields.cta = { [LOCALE]: makeLink(itemCta.sys.id) };

    if (f.icon?.length && assetMap) {
      const assetId = String(f.icon[0]);
      const assetInfo = assetMap.get(assetId);
      if (assetInfo && assetInfo.id) {
        const isReady = await ensureAssetPublished(env, assetInfo.id);
        if (isReady) {
          itemFields.icon = {
            [LOCALE]: {
              sys: { type: "Link", linkType: "Asset", id: assetInfo.id },
            },
          };
        } else {
          console.warn(
            `   ⚠️ Skipping missing icon ${assetInfo.id} for Feature Grid item`,
          );
          if (summary) summary.missingAssetMetadata.push(assetId);
        }
      }
    }

    const itemEntry = await upsertEntry(
      env,
      "featureGridItem",
      `fgitem-${gId}`,
      itemFields,
    );
    if (itemEntry) itemRefs.push(makeLink(itemEntry.sys.id));
  }

  const fields = {
    blockId: { [LOCALE]: blockId },
    blockName: { [LOCALE]: blockData.blockName || heading || "Feature Grid" },
  };
  if (titleEntry)
    fields.sectionTitle = { [LOCALE]: makeLink(titleEntry.sys.id) };
  if (blockData.subheadingSmall) {
    fields.description = {
      [LOCALE]: await convertHtmlToRichText(env, blockData.subheadingSmall),
    };
  }
  if (ctaEntry) fields.cta = { [LOCALE]: makeLink(ctaEntry.sys.id) };
  if (itemRefs.length) fields.addItem = { [LOCALE]: itemRefs };

  return await upsertEntry(env, CONTENT_TYPE, `featuregrid-${blockId}`, fields);
}
