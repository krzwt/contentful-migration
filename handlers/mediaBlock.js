import { upsertEntry, upsertSectionTitle, makeLink, upsertAssetWrapper } from "../utils/contentfulHelpers.js";

const LOCALE = "en-US";
const CONTENT_TYPE = "mediaBlock";

/**
 * Handler for mediaBlock (nested in contentBlock as type: fullWidthAsset)
 */
export async function createOrUpdateMediaBlock(env, id, fields, assetMap, summary = null) {
    try {
        await env.getContentType(CONTENT_TYPE);
    } catch (err) {
        console.warn(`   ⚠ Component "${CONTENT_TYPE}" not found: ${err.message}. Skipping.`);
        return null;
    }

    // 1. Section Title
    let titleEntry = null;
    if (fields.heading) {
        titleEntry = await upsertSectionTitle(env, `mediablock-${id}`, fields.heading);
    }

    // 2. Asset (Image/Video)
    // Craft fullWidthAsset fields: { asset: [ID], description: string }
    let assetEntry = null;
    if (fields.asset?.length && assetMap) {
        const craftAssetId = String(fields.asset[0]);
        const assetInfo = assetMap.get(craftAssetId);
        if (assetInfo) {
            // upsertAssetWrapper creates the 'asset' entry wrapper Contentful expects
            assetEntry = await upsertAssetWrapper(env, id, assetInfo.id, assetInfo.mimeType);
        }
    }

    const cfFields = {
        blockId: { [LOCALE]: String(id) },
        blockName: { [LOCALE]: fields.blockName || fields.heading || `Media Block ${id}` },
        description: { [LOCALE]: fields.description || "" }
    };

    if (titleEntry) cfFields.sectionTitle = { [LOCALE]: makeLink(titleEntry.sys.id) };
    if (assetEntry) cfFields.addAsset = { [LOCALE]: makeLink(assetEntry.sys.id) };

    return await upsertEntry(env, CONTENT_TYPE, `mediablock-${id}`, cfFields);
}
