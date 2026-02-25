import { upsertEntry, upsertCta, makeLink, parseCraftLink, resolveInternalUrl, resolveInternalTitle } from "../utils/contentfulHelpers.js";

const LOCALE = "en-US";
const CONTENT_TYPE = "quoteItem";

/**
 * Handler for standalone quote entries (quoteItem)
 */
export async function migrateQuotes(env, quotesData, assetMap = null, targetIndices = null, totalPages = null, summary = null) {
    const total = targetIndices ? targetIndices[targetIndices.length - 1] + 1 : (totalPages || quotesData.length);
    console.log(`\n📰 Starting Company Quotes Migration (${quotesData.length} entries)...`);

    for (let i = 0; i < quotesData.length; i++) {
        const quote = quotesData[i];
        const pageNum = targetIndices ? targetIndices[i] + 1 : i + 1;
        const progress = `[${pageNum} / ${total}]`;
        const shouldPublish = quote.status === "live";
        console.log(`\n➡️ ${progress} Quote: ${quote.title} (ID: ${quote.id}, Status: ${quote.status})`);

        try {
            const fields = {
                entryId: { [LOCALE]: String(quote.id) },
                title: { [LOCALE]: quote.title || `Quote ${quote.id}` },
                quoteText: { [LOCALE]: quote.quoteText || "" },
                quoteSource: { [LOCALE]: quote.quoteSource || "" },
                quoteDescription: { [LOCALE]: quote.quoteDescription || "" }
            };

            // 1. Handle quoteLogo (Asset Link)
            if (quote.quoteLogo?.length && assetMap) {
                const logoId = String(quote.quoteLogo[0]);
                const assetInfo = assetMap.get(logoId);
                if (assetInfo && assetInfo.id) {
                    fields.quoteLogo = { [LOCALE]: { sys: { type: "Link", linkType: "Asset", id: assetInfo.id } } };
                }
            }

            // 2. Handle ctaLink (Link to cta entry)
            if (quote.ctaLink) {
                const { url: craftUrl, label: craftLabel, linkedId } = parseCraftLink(quote.ctaLink);
                let url = craftUrl;
                let label = craftLabel;

                // 1. Resolve internal links if possible
                if (linkedId) {
                    if (!url) {
                        const resolvedUrl = resolveInternalUrl(String(linkedId));
                        if (resolvedUrl) {
                            url = resolvedUrl.startsWith("http") ? resolvedUrl : `/${resolvedUrl.replace(/^\//, "")}`;
                        }
                    }
                    if (!label) {
                        label = resolveInternalTitle(String(linkedId));
                    }
                }

                // 2. Decide if we should create a CTA
                // If we have NO URL and NO Label, it's an empty link -> Skip
                if (!url && !label && !linkedId) {
                    // Truly empty
                } else if (!url && linkedId && !label) {
                    // We have an ID but couldn't find URL or Title in our maps
                    // PERMANENT SOLUTION: Generate a dynamic fallback based on the quote title
                    console.warn(`   ⚠️ CTA Warning: Could not resolve internal link ID ${linkedId}. Generating fallback CTA.`);

                    const companyName = quote.title.split('-')[0].trim();
                    const finalLabel = `${companyName} Success Story`;
                    const finalUrl = `/resources/case-study/${companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

                    console.log(`   🔗 CTA (Fallback): "${finalLabel}" -> ${finalUrl}`);
                    const ctaEntry = await upsertCta(env, `quote-${quote.id}`, finalLabel, finalUrl, shouldPublish);
                    if (ctaEntry) {
                        fields.cta = { [LOCALE]: makeLink(ctaEntry.sys.id) };
                    }
                } else {
                    // We have at least a URL or a Title
                    const finalLabel = label || "";
                    const finalUrl = url || "";

                    console.log(`   🔗 CTA: "${finalLabel || "(No Label)"}" -> ${finalUrl || "(No URL resolved)"}`);
                    const ctaEntry = await upsertCta(env, `quote-${quote.id}`, finalLabel, finalUrl, shouldPublish);
                    if (ctaEntry) {
                        fields.cta = { [LOCALE]: makeLink(ctaEntry.sys.id) };
                    }
                }
            }

            // 3. Handle sourcePerson (Link to peopleCpt entry)
            if (quote.sourcePerson?.length) {
                const personId = quote.sourcePerson[0];
                fields.personsPhoto = { [LOCALE]: makeLink(`person-${personId}`) };
            }

            // 4. Upsert the quoteItem
            const entryId = `quote-${quote.id}`;
            await upsertEntry(env, CONTENT_TYPE, entryId, fields, shouldPublish);
            console.log(`   ✅ Quote "${quote.title}" migrated (${shouldPublish ? 'Published' : 'Draft'}).`);

        } catch (err) {
            console.error(`   🛑 Error migrating quote ${quote.id}:`, err.message);
        }
    }
}
