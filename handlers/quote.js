import { upsertEntry, makeLink, parseCraftLink, resolveInternalUrl } from "../utils/contentfulHelpers.js";

const LOCALE = "en-US";
const CONTENT_TYPE = "quote";

export async function createOrUpdateQuote(env, blockData, assetMap = null) {
    try {
        await env.getContentType(CONTENT_TYPE);
    } catch (err) {
        console.warn(`   ⚠ Content type "${CONTENT_TYPE}" not found: ${err.message}. Skipping.`);
        return null;
    }

    const fields = blockData.fields || blockData;
    const blockId = blockData.id || blockData.blockId || `quote-${Date.now()}`;

    // Process Quote URL -> String URL or linked Entry
    const rawQuoteUrl = fields.quoteUrl;
    let finalUrl = "";
    let finalLinkedId = null;

    if (rawQuoteUrl) {
        const parsed = parseCraftLink(rawQuoteUrl);
        finalUrl = parsed.url || "";
        finalLinkedId = parsed.linkedId || null;
    }

    const contentfulFields = {
        quoteBody: { [LOCALE]: String(fields.quoteBody || "") }
    };

    if (fields.quoteSource) {
        contentfulFields.quoteSource = { [LOCALE]: String(fields.quoteSource) };
    }

    if (fields.quoteCite) {
        contentfulFields.quoteCite = { [LOCALE]: String(fields.quoteCite) };
    }

    // Determine how to save the link (quoteUrl vs quotePageLink)
    if (finalLinkedId) {
        let validEntryId = null;

        // In Contentful, entries use prefixes like page-, resource-, webinar-
        const possiblePrefixes = ["page-", "resource-", "webinar-", "person-", "quote-"];
        for (const prefix of possiblePrefixes) {
            try {
                const checkId = `${prefix}${finalLinkedId}`;
                const entryCheck = await env.getEntry(checkId);
                if (entryCheck) {
                    validEntryId = checkId;
                    break;
                }
            } catch (err) {
                // not found, ignore 404
            }
        }

        if (validEntryId) {
            contentfulFields.quotePageLink = { [LOCALE]: makeLink(validEntryId) };
        } else {
            console.warn(`   ⚠️ Quote Warning: Could not find Contentful entry for linkedId ${finalLinkedId}. Falling back to plain URL string.`);
            const fallbackUrl = resolveInternalUrl(String(finalLinkedId));
            if (fallbackUrl) {
                contentfulFields.quoteUrl = { [LOCALE]: String(fallbackUrl) };
            } else if (finalUrl) {
                contentfulFields.quoteUrl = { [LOCALE]: String(finalUrl) };
            }
        }
    } else if (finalUrl) {
        // Plain external URL
        contentfulFields.quoteUrl = { [LOCALE]: String(finalUrl) };
    }

    // Upsert the entry
    return await upsertEntry(env, CONTENT_TYPE, `quote-${blockId}`, contentfulFields);
}
