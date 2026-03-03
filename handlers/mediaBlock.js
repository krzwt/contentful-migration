import {
  upsertEntry,
  upsertSectionTitle,
  makeLink,
  upsertAssetWrapper,
} from "../utils/contentfulHelpers.js";

const LOCALE = "en-US";
const CONTENT_TYPE = "mediaBlock";

export async function createOrUpdateMediaBlock(
  env,
  arg2, // Could be blockData (object) or id (string)
  arg3, // Could be assetMap or fields
  arg4, // Could be summary or assetMap
  arg5, // Could be summary
) {
  let blockData, assetMap, summary;

  if (typeof arg2 === "object" && arg2.blockId) {
    // Standard 4-arg call from index.js: (env, blockData, assetMap, summary)
    blockData = arg2;
    assetMap = arg3;
    summary = arg4;
  } else {
    // 5-arg call from contentBlock.js: (env, id, fields, assetMap, summary)
    blockData = { blockId: arg2, ...arg3 };
    assetMap = arg4;
    summary = arg5;
  }

  const id = blockData.blockId;

  try {
    await env.getContentType(CONTENT_TYPE);
  } catch (err) {
    console.warn(
      `   ⚠ Component "${CONTENT_TYPE}" not found: ${err.message}. Skipping.`,
    );
    return null;
  }

  // 1. Section Title
  let titleEntry = null;
  const heading = blockData.headingSection || blockData.heading || "";
  if (heading) {
    titleEntry = await upsertSectionTitle(
      env,
      `mediablock-${id}`,
      heading,
    );
  }

  // 2. Asset (Image/Video)
  // Craft fullWidthAsset fields: { asset: [ID], description: string }
  let assetEntry = null;
  if (blockData.asset?.length && assetMap) {
    const craftAssetId = String(blockData.asset[0]);
    const assetInfo = assetMap.get(craftAssetId);
    if (assetInfo) {
      // upsertAssetWrapper creates the 'asset' entry wrapper Contentful expects
      assetEntry = await upsertAssetWrapper(
        env,
        id,
        assetInfo.id,
        assetInfo.mimeType,
        assetInfo.wistiaUrl,
      );
    }
  }

  const cfFields = {
    blockId: { [LOCALE]: String(id) },
    blockName: {
      [LOCALE]: blockData.blockName || heading || `Media Block ${id}`,
    },
    description: { [LOCALE]: blockData.description || "" },
  };

  if (titleEntry)
    cfFields.sectionTitle = { [LOCALE]: makeLink(titleEntry.sys.id) };
  if (assetEntry) cfFields.addAsset = { [LOCALE]: makeLink(assetEntry.sys.id) };

  return await upsertEntry(env, CONTENT_TYPE, `mediablock-${id}`, cfFields);
}
