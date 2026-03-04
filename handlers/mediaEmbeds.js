/*
 * Craft: sourceUrl, queryParameters
 * Contentful: mediaEmbeds { blockId, blockName, sourceUrl, queryParameters }
 */
import { upsertEntry } from "../utils/contentfulHelpers.js";

const LOCALE = "en-US";
const CONTENT_TYPE = "mediaEmbeds";

export async function createOrUpdateMediaEmbeds(env, blockData) {
    const id = blockData.blockId;

    const cleanUrl = (blockData.sourceUrl || "").replace(/\/$/, "");

    const fields = {
        blockId: { [LOCALE]: String(id) },
        blockName: { [LOCALE]: blockData.blockName || (cleanUrl ? `Embed: ${cleanUrl}` : `Media Embed ${id}`) },
        sourceUrl: { [LOCALE]: cleanUrl },
        queryParameters: { [LOCALE]: blockData.queryParameters || "" }
    };

    return await upsertEntry(env, CONTENT_TYPE, `media-${id}`, fields);
}
