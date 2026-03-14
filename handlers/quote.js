import { upsertEntry, makeLink, parseCraftLink, resolveInternalUrl, upsertCta } from "../utils/contentfulHelpers.js";

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

    // quoteUrl in Contentful is Link to "cta" entry, not a string — create CTA and link
    const urlForCta = finalUrl || (finalLinkedId ? resolveInternalUrl(String(finalLinkedId)) : null);
    if (urlForCta) {
        const label = (fields.quoteCite && String(fields.quoteCite).slice(0, 200)) || "Source";
        const ctaEntry = await upsertCta(env, `quote-cta-${blockId}`, label, urlForCta, true, finalLinkedId || undefined);
        if (ctaEntry?.sys?.id) {
            contentfulFields.quoteUrl = { [LOCALE]: makeLink(ctaEntry.sys.id) };
        }
    }

    // Upsert the entry
    return await upsertEntry(env, CONTENT_TYPE, `quote-${blockId}`, contentfulFields);
}
