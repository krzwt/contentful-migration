import {
  upsertEntry,
  upsertSectionTitle,
  upsertAssetWrapper,
  upsertCta,
  makeLink,
  parseCraftLink,
  resolveInternalUrl,
} from "../utils/contentfulHelpers.js";
import { convertHtmlToRichText } from "../utils/richText.js";
import { getOrderedKeys } from "../utils/jsonOrder.js";

const LOCALE = "en-US";
const CONTENT_TYPE = "featureTabbed";

export async function createOrUpdateFeatureTabbed(
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
  const heading = blockData.headingSection || "";

  const titleEntry = await upsertSectionTitle(env, blockId, heading);

  // Handle top-level image asset
  let assetEntry = null;
  const contentAsset = blockData.contentAsset || {};
  const orderedCaIds = getOrderedKeys(blockData.blockSegment, contentAsset);
  for (const caId of orderedCaIds) {
    const ca = contentAsset[caId];
    if (typeof ca !== "object" || !ca.fields) continue;
    const imgIds = ca.fields?.image || ca.fields?.video || [];
    if (imgIds.length && assetMap) {
      const assetInfo = assetMap.get(String(imgIds[0]));
      if (assetInfo) {
        assetEntry = await upsertAssetWrapper(
          env,
          `ft-${blockId}`,
          assetInfo.id,
          assetInfo.mimeType,
          assetInfo.wistiaUrl,
        );
      }
    }
  }

  // Create tabbed items
  const tabRefs = [];
  const tabbedData = blockData.featureTabbed || {};
  const orderedTIds = getOrderedKeys(blockData.blockSegment, tabbedData);

  for (const tId of orderedTIds) {
    const tab = tabbedData[tId];
    if (typeof tab !== "object" || !tab.fields) continue;
    const f = tab.fields;

    // CTA
    let ctaEntry = null;
    const linkInfo = parseCraftLink(f.ctaLink);
    let label = f.ctaLinkText || f.ctaLabel || linkInfo.label || "";
    let url = linkInfo.url;

    if (!url && linkInfo.linkedId) {
      url = resolveInternalUrl(linkInfo.linkedId) || "";
    }

    if (url || label || linkInfo.linkedId) {
      ctaEntry = await upsertCta(
        env,
        `ft-${tId}`,
        label,
        url,
        true,
        linkInfo.linkedId,
      );
    }

    const itemFields = {
      tabLink: { [LOCALE]: f.tabLink || f.heading || "" },
      heading: { [LOCALE]: f.heading || "" },
      description: { [LOCALE]: await convertHtmlToRichText(env, f.body || "") },
    };

    if (ctaEntry) itemFields.cta = { [LOCALE]: makeLink(ctaEntry.sys.id) };

    // Handle tab-level asset
    let tabAssetWrapper = null;
    const featureAsset = f.featureAsset || {};
    for (const faId in featureAsset) {
      const fa = featureAsset[faId];
      if (typeof fa !== "object" || !fa.fields) continue;
      const faFields = fa.fields;
      const assetIds = faFields.image || faFields.video || [];
      if (assetIds.length && assetMap) {
        const assetInfo = assetMap.get(String(assetIds[0]));
        if (assetInfo) {
          tabAssetWrapper = await upsertAssetWrapper(
            env,
            `ftitem-${tId}`,
            assetInfo.id,
            assetInfo.mimeType,
            assetInfo.wistiaUrl,
          );
          break;
        }
      }
    }
    if (tabAssetWrapper)
      itemFields.addAsset = { [LOCALE]: makeLink(tabAssetWrapper.sys.id) };

    const itemEntry = await upsertEntry(
      env,
      "featureTabbedItem",
      `ftitem-${tId}`,
      itemFields,
    );
    if (itemEntry) tabRefs.push(makeLink(itemEntry.sys.id));
  }

  const fields = {
    blockId: { [LOCALE]: blockId },
    blockName: { [LOCALE]: blockData.blockName || heading || "Feature Tabbed" },
  };
  if (titleEntry)
    fields.sectionTitle = { [LOCALE]: makeLink(titleEntry.sys.id) };
  if (blockData.bodyRedactorRestricted) {
    fields.description = { [LOCALE]: blockData.bodyRedactorRestricted };
  }
  if (assetEntry) fields.addAsset = { [LOCALE]: makeLink(assetEntry.sys.id) };
  if (tabRefs.length) fields.addFeatureTabbedItem = { [LOCALE]: tabRefs };

  return await upsertEntry(env, CONTENT_TYPE, `feattab-${blockId}`, fields);
}
