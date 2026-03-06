import { upsertEntry } from "../utils/contentfulHelpers.js";

/**
 * Main function to migrate Form entries
 */
export async function migrateForms(env, formsData, summary = null) {
    // forms-import.json has an "entries" key
    const entries = formsData.entries || formsData;

    console.log(`\n📝 Starting Forms Migration (${entries.length} entries)...`);

    for (let i = 0; i < entries.length; i++) {
        const item = entries[i];
        const fields = item.fields;
        const entryIdValue = fields.entryId["en-US"];
        const formName = fields.formName["en-US"];

        // Construct a stable Contentful ID
        const contentfulId = `form-${entryIdValue}`;

        console.log(`➡️ [${i + 1} / ${entries.length}] Form: ${formName} (${contentfulId})`);

        try {
            const entry = await upsertEntry(env, "embedFormsCpt", contentfulId, fields, true);
            if (entry && summary) {
                summary.processed++;
                if (entry.sys.version === 1) summary.created++;
                else summary.updated++;
            }
        } catch (err) {
            console.error(`❌ Error migrating form "${formName}":`, err.message);
            if (summary) {
                summary.skipped.push({
                    page: formName,
                    blockId: contentfulId,
                    type: "embedFormsCpt",
                    error: err.message
                });
            }
        }
    }
}
