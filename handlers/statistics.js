/**
 * Handler: statistics → statisticsBlock
 * Craft: headingSection, body250, statistics (nested groups with statistic items)
 * Contentful: statisticsBlock { sectionTitle, description, cta, addStatistics: [statistics], removeColorTheme }
 */
import { upsertEntry, upsertSectionTitle, upsertCta, makeLink, parseCraftLink } from "../utils/contentfulHelpers.js";
import { getOrderedKeys } from "../utils/jsonOrder.js";

const LOCALE = "en-US";
const CONTENT_TYPE = "statisticsBlock";

export async function createOrUpdateStatistics(env, blockData, assetMap = null) {
    try { await env.getContentType(CONTENT_TYPE); } catch (err) {
        console.warn(`   ⚠ Content type "${CONTENT_TYPE}" not found: ${err.message}. Skipping.`);
        return null;
    }

    const blockId = blockData.blockId;
    const heading = blockData.headingSection || blockData.heading || "";

    const titleEntry = heading ? await upsertSectionTitle(env, blockId, heading) : null;

    let ctaEntry = null;
    const link = parseCraftLink(blockData.ctaLink);
    if (link.url || blockData.label) {
        ctaEntry = await upsertCta(env, blockId, blockData.label || link.label || "", link.url);
    }

    const statRefs = [];
    const statsData = blockData.statistics || {};

    const orderedGIds = getOrderedKeys(blockData.blockSegment, statsData);
    for (const sId of orderedGIds) {
        const statGroup = statsData[sId];
        if (typeof statGroup !== "object" || !statGroup.fields) continue;

        // Extract group segment
        const gIdx = blockData.blockSegment.indexOf(`"${sId}":`);
        const nextGId = orderedGIds[orderedGIds.indexOf(sId) + 1];
        const nextGIdx = nextGId ? blockData.blockSegment.indexOf(`"${nextGId}":`) : blockData.blockSegment.length;
        const groupSegment = blockData.blockSegment.substring(gIdx, nextGIdx);

        const listing = statGroup.fields?.listing || {};
        const orderedItemIds = getOrderedKeys(groupSegment, listing);

        for (const itemId of orderedItemIds) {
            const item = listing[itemId];
            if (typeof item !== "object" || !item.fields) continue;
            const f = item.fields;

            const itemFields = {
                rangeStart: { [LOCALE]: String(f.rangeStart ?? "0") },
                rangeEnd: { [LOCALE]: String(f.rangeEnd ?? "0") },
                statDescription: { [LOCALE]: f.description || "" }
            };
            if (f.suffix) itemFields.suffix = { [LOCALE]: f.suffix };
            if (f.footnote) itemFields.footnote = { [LOCALE]: f.footnote };

            const itemEntry = await upsertEntry(env, "statistics", `stat-${itemId}`, itemFields);
            if (itemEntry) statRefs.push(makeLink(itemEntry.sys.id));
        }
    }

    const fields = {};
    if (titleEntry) fields.sectionTitle = { [LOCALE]: makeLink(titleEntry.sys.id) };
    if (blockData.body250) fields.description = { [LOCALE]: blockData.body250 };
    if (ctaEntry) fields.cta = { [LOCALE]: makeLink(ctaEntry.sys.id) };
    if (statRefs.length) fields.addStatistics = { [LOCALE]: statRefs };

    return await upsertEntry(env, CONTENT_TYPE, `stats-${blockId}`, fields);
}
