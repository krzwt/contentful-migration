/**
 * Handler: quotes → quotesBlock
 * Craft: companyQuotes = array of entry IDs (references to external quote entries)
 * Contentful: quotesBlock { blockId, blockName, heading, quoteItems: [quoteItem] }
 * If a quote entry doesn't exist, we try to create it from company-quotes.json (ensureQuoteItem).
 */
import { upsertEntry, upsertSectionTitle, makeLink } from "../utils/contentfulHelpers.js";
import { ensureQuoteItem } from "./quoteHandler.js";

const LOCALE = "en-US";
const CONTENT_TYPE = "quotesBlock";

export async function createOrUpdateQuotes(env, blockData, assetMap = null) {
    try { await env.getContentType(CONTENT_TYPE); } catch (err) {
        console.warn(`   ⚠ Content type "${CONTENT_TYPE}" not found: ${err.message}. Skipping.`);
        return null;
    }

    const fields = blockData || {};
    const blockId = fields.blockId || `quotes-${Date.now()}`;

    // Only use actual heading fields from Craft. Avoid using fields.heading 
    // since index.js injects the page title as a fallback if it's empty.
    const heading = fields.headingSection || fields.heading45 || "";

    // Build quoteItem entries from source IDs — only link to quotes that exist in Contentful (avoids notResolvable on publish)
    const quoteRefs = [];
    const missingIds = [];
    const quoteIds = fields.companyQuotes || [];

    for (const qId of quoteIds) {
        const entryId = `quote-${qId}`;
        if (!env) {
            quoteRefs.push(makeLink(entryId));
            continue;
        }
        let entry = null;
        try {
            entry = await env.getEntry(entryId);
        } catch (_) {
            // Quote not in Contentful — try to create from company-quotes.json
            entry = await ensureQuoteItem(env, qId, assetMap);
        }
        if (entry?.sys?.id) {
            quoteRefs.push(makeLink(entry.sys.id));
        } else {
            missingIds.push(qId);
        }
    }

    const contentfulFields = {
        blockId: { [LOCALE]: String(blockId) },
        blockName: { [LOCALE]: blockData.blockName || heading || "Quotes Block" },
        heading: { [LOCALE]: heading }
    };

    if (quoteRefs.length) {
        contentfulFields.quoteItems = { [LOCALE]: quoteRefs };
        console.log(`   🔗 Linked ${quoteRefs.length} quotes to block.`);
    } else {
        contentfulFields.quoteItems = { [LOCALE]: [] };
    }
    if (missingIds.length) {
        console.warn(`   ⚠ quotesBlock ${blockId}: ${missingIds.length} quote(s) not in Contentful — skipped (IDs: ${missingIds.join(", ")})`);
    }

    // Upsert the block
    return await upsertEntry(env, CONTENT_TYPE, `quotesblock-${blockId}`, contentfulFields);
}
