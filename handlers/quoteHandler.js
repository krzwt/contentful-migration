import { upsertEntry, upsertCta, makeLink, parseCraftLink } from "../utils/contentfulHelpers.js";

const LOCALE = "en-US";
const CONTENT_TYPE = "quoteItem";

/**
 * Handler for standalone quote entries (quoteItem)
 */
export async function migrateQuotes(env, quotesData, assetMap = null) {
    console.log(`\n📰 Starting Company Quotes Migration (${quotesData.length} entries)...`);

    for (let i = 0; i < quotesData.length; i++) {
        const quote = quotesData[i];
        const progress = `[${i + 1} / ${quotesData.length}]`;
        console.log(`\n➡️ ${progress} Quote: ${quote.title} (ID: ${quote.id})`);

        try {
            const fields = {
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
                const { url, label } = parseCraftLink(quote.ctaLink);
                if (url || label) {
                    const ctaEntry = await upsertCta(env, `quote-${quote.id}`, label || "Read More", url);
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
            await upsertEntry(env, CONTENT_TYPE, entryId, fields);
            console.log(`   ✅ Quote "${quote.title}" migrated.`);

        } catch (err) {
            console.error(`   🛑 Error migrating quote ${quote.id}:`, err.message);
        }
    }
}
