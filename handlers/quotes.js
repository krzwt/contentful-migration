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

    const blockId = blockData.blockId;
    const heading = blockData.headingSection || blockData.heading || "";

    // Build quoteItem entries from source IDs
    const quoteRefs = [];
    const quoteIds = blockData.companyQuotes || [];
    for (const qId of quoteIds) {
        const itemEntry = await upsertEntry(env, "quoteItem", `quote-${qId}`, {
            title: { [LOCALE]: `Quote ${qId}` },
            quoteText: { [LOCALE]: `[Imported quote ref: ${qId}]` }
        });
        if (itemEntry) quoteRefs.push(makeLink(itemEntry.sys.id));
    }

    const fields = {
        blockId: { [LOCALE]: blockId },
        blockName: { [LOCALE]: blockData.blockName || heading || "Quotes Block" },
        heading: { [LOCALE]: heading }
    };

    if (quoteRefs.length) {
        fields.quoteItems = { [LOCALE]: quoteRefs };
    }

    // Upsert the block
    return await upsertEntry(env, CONTENT_TYPE, `quotesblock-${blockId}`, fields);
}
