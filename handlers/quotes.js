/**
 * Handler: quotes → quotesBlock
 * Craft: companyQuotes = array of entry IDs (references to external quote entries)
 * Contentful: quotesBlock { blockId, blockName, heading, quoteItems: [quoteItem] }
 *
 * Since Craft quotes reference external entries (IDs only), we create placeholder
 * quoteItem entries with the ID. The actual quote data would need to come from
 * a separate data export.
 */
import { upsertEntry, upsertSectionTitle, makeLink } from "../utils/contentfulHelpers.js";

const LOCALE = "en-US";
const CONTENT_TYPE = "quotesBlock";

export async function createOrUpdateQuotes(env, blockData, assetMap = null) {
    try { await env.getContentType(CONTENT_TYPE); } catch (err) {
        console.warn(`   ⚠ Content type "${CONTENT_TYPE}" not found: ${err.message}. Skipping.`);
        return null;
    }

    const fields = blockData.fields || {};
    const blockId = blockData.blockId || `quotes-${Date.now()}`;
    const heading = fields.headingSection || fields.heading || "";

    // Build quoteItem entries from source IDs
    const quoteRefs = [];
    const quoteIds = fields.companyQuotes || [];

    for (const qId of quoteIds) {
        // We assume quotes are already migrated with ID: quote-ID
        // We just link to them. If it doesn't exist, Contentful will show a broken link until it's migrated.
        quoteRefs.push(makeLink(`quote-${qId}`));
    }

    const contentfulFields = {
        blockId: { [LOCALE]: String(blockId) },
        blockName: { [LOCALE]: blockData.blockName || heading || "Quotes Block" },
        heading: { [LOCALE]: heading }
    };

    if (quoteRefs.length) {
        contentfulFields.quoteItems = { [LOCALE]: quoteRefs };
        console.log(`   🔗 Linked ${quoteRefs.length} quotes to block.`);
    }

    // Upsert the block
    return await upsertEntry(env, CONTENT_TYPE, `quotesblock-${blockId}`, contentfulFields);
}
