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
    blockData = arg2;
    assetMap = arg3;
    summary = arg4;
  } else {
    blockData = { blockId: arg2, ...arg3 };
    assetMap = arg4;
    summary = arg5;
  }

  const id = blockData.blockId;

  // 1. Handle "embeds" array (multiple embeds in one block)
  if (blockData.embeds && Array.isArray(blockData.embeds)) {
    console.log(`   🎬 Processing ${blockData.embeds.length} embeds for block ${id}...`);
    const results = [];
    for (let i = 0; i < blockData.embeds.length; i++) {
      const embed = blockData.embeds[i];
      // Create a sub-block data for each embed
      const subBlock = {
        blockId: `${id}-e${i}`,
        blockName: embed.fields?.title || `Embed ${i} for ${id}`,
        sourceUrl: embed.fields?.sourceUrl,
        queryParameters: embed.fields?.queryParameters,
        description: embed.fields?.description || ""
      };
      const entry = await createOrUpdateMediaBlock(env, subBlock, assetMap, summary);
      if (entry) results.push(entry);
    }
    return results; // Return array to index.js
  }

  try {
    await env.getContentType(CONTENT_TYPE);
  } catch (err) {
    console.warn(`   ⚠ Component "${CONTENT_TYPE}" not found: ${err.message}. Skipping.`);
    return null;
  }

  // 1. Section Title
  let titleEntry = null;
  const heading = blockData.headingSection || blockData.heading || "";
  if (heading) {
    titleEntry = await upsertSectionTitle(env, `mediablock-${id}`, heading);
  }

  // 2. Media Asset Link (detect either Craft asset OR external sourceUrl)
  let assetEntry = null;
  const cleanUrl = (blockData.sourceUrl || "").replace(/\/$/, "");

  if (blockData.asset?.length && assetMap) {
    const craftAssetId = String(blockData.asset[0]);
    const assetInfo = assetMap.get(craftAssetId);
    if (assetInfo) {
      assetEntry = await upsertAssetWrapper(env, id, assetInfo.id, assetInfo.mimeType, assetInfo.wistiaUrl);
    }
  } else if (cleanUrl) {
    // It's an external embed URL
    console.log(`   🔗 Creating embed asset wrapper for mediaBlock: ${cleanUrl}`);
    assetEntry = await upsertAssetWrapper(env, id, null, "video/mp4", cleanUrl);
  }

  const cfFields = {
    blockId: { [LOCALE]: String(id) },
    blockName: {
      [LOCALE]: blockData.blockName || heading || (cleanUrl ? `Embed: ${cleanUrl}` : `Media Block ${id}`),
    },
    description: { [LOCALE]: blockData.description || "" },
  };

  if (titleEntry) cfFields.sectionTitle = { [LOCALE]: makeLink(titleEntry.sys.id) };
  if (assetEntry) cfFields.addAsset = { [LOCALE]: makeLink(assetEntry.sys.id) };

  return await upsertEntry(env, CONTENT_TYPE, `mediablock-${id}`, cfFields);
}
