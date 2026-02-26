/**
 * Handler: customerBundle → customerBundle
 * Craft: headingMedium, bundleGrid (nested groups with items: icon, heading, body, ctaLink)
 * Contentful: customerBundle { blockId, blockName, sectionTitle, addItem: [customerBundleItem] }
 */
import {
  upsertEntry,
  upsertSectionTitle,
  upsertCta,
  makeLink,
  parseCraftLink,
  ensureAssetPublished,
} from "../utils/contentfulHelpers.js";

const LOCALE = "en-US";
const CONTENT_TYPE = "customerBundle";

export async function createOrUpdateCustomerBundle(
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
  const heading = blockData.headingMedium || blockData.headingSection || "";

  const titleEntry = await upsertSectionTitle(env, blockId, heading);

  const itemRefs = [];
  const bundleData = blockData.bundleGrid || {};

  for (const [gId, group] of Object.entries(bundleData)) {
    if (typeof group !== "object" || !group.fields) continue;
    const gridItems = group.fields?.grid || {};

    for (const [iId, item] of Object.entries(gridItems)) {
      if (typeof item !== "object" || !item.fields) continue;
      const f = item.fields;

      let ctaEntry = null;
      const link = parseCraftLink(f.ctaLink);
      if (link.url) {
        ctaEntry = await upsertCta(
          env,
          `cb-${iId}`,
          link.label || "",
          link.url,
        );
      }

      const itemFields = {
        title: { [LOCALE]: f.heading || "" },
        description: { [LOCALE]: f.body || "" },
      };
      if (ctaEntry) itemFields.cta = { [LOCALE]: makeLink(ctaEntry.sys.id) };

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
              `   ⚠️ Skipping missing icon ${assetInfo.id} for Customer Bundle item`,
            );
            if (summary) summary.missingAssetMetadata.push(assetId);
          }
        }
      }

      const itemEntry = await upsertEntry(
        env,
        "customerBundleItem",
        `cbitem-${iId}`,
        itemFields,
      );
      if (itemEntry) itemRefs.push(makeLink(itemEntry.sys.id));
    }
  }

  const fields = {
    blockId: { [LOCALE]: blockId },
    blockName: {
      [LOCALE]: blockData.blockName || heading || "Customer Bundle",
    },
  };
  if (titleEntry)
    fields.sectionTitle = { [LOCALE]: makeLink(titleEntry.sys.id) };
  if (itemRefs.length) fields.addItem = { [LOCALE]: itemRefs };

  return await upsertEntry(env, CONTENT_TYPE, `custbundle-${blockId}`, fields);
}
