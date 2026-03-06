import { convertHtmlToRichText } from "../utils/richText.js";
import { upsertEntry } from "../utils/contentfulHelpers.js";

let LOCALE = "en-US";
const CONTENT_TYPE = "newGlobalReachMap";

/**
 * Handler for standalone Global Reach Map entries
 */
export async function migrateGlobalReachMap(env, data, summary = null) {
    // Dynamically get default locale
    if (env) {
        try {
            const locales = await env.getLocales();
            const defaultLocale = locales.items.find(l => l.default);
            if (defaultLocale) {
                LOCALE = defaultLocale.code;
                console.log(`   🌍 Using default locale: ${LOCALE}`);
            }
        } catch (e) {
            console.warn(`   ⚠️ Could not fetch locales, falling back to ${LOCALE}`);
        }
    }

    console.log(`\n🗺️ Starting Global Reach Map Migration (${data.length} entries)...`);

    for (let i = 0; i < data.length; i++) {
        const item = data[i];
        const shouldPublish = item.status === "live" || item.enabled === true;
        console.log(`\n➡️ [${i + 1} / ${data.length}] Global Reach Map Item: ${item.title} (ID: ${item.id})`);

        try {
            const fields = {
                entryId: { [LOCALE]: String(item.id).trim() },
                title: { [LOCALE]: (item.title || `Map Item ${item.id}`).trim() },
                globalReachType: { [LOCALE]: (item.globalReachType ? item.globalReachType.charAt(0).toUpperCase() + item.globalReachType.slice(1).toLowerCase() : "") },
                latitude: { [LOCALE]: String(item.latitude || "").trim() },
                longitude: { [LOCALE]: String(item.longitude || "").trim() }
            };

            // Process tooltip (HTML to Rich Text)
            if (item.bodyRedactorRestricted) {
                const richTextContent = await convertHtmlToRichText(env, item.bodyRedactorRestricted);
                fields.tooltip = { [LOCALE]: richTextContent };
                // Log first few characters of RT or some identifying info
                console.log(`   📝 Tooltip RT size: ${JSON.stringify(richTextContent).length} chars.`);
            }

            // Upsert the entry
            const entryId = `map-${item.id}`;
            await upsertEntry(env, CONTENT_TYPE, entryId, fields, shouldPublish);
            console.log(`   ✅ Mathed and Migrated: "${item.title}" (${shouldPublish ? 'Published' : 'Draft'}).`);

        } catch (err) {
            console.error(`   🛑 Error migrating map item ${item.id}:`, err.message);
            if (summary && summary.skipped) {
                summary.skipped.push({
                    page: item.title,
                    blockId: item.id,
                    type: CONTENT_TYPE,
                    error: err.message
                });
            }
        }
    }
}
