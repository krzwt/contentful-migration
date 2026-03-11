import fs from "fs";
import { getEnvironment } from "./config/contentful.js";
import { upsertEntry } from "./utils/contentfulHelpers.js";

async function run() {
    console.log("🚀 Starting Embed Forms Import...");

    const file = "./data/forms-import.json";
    if (!fs.existsSync(file)) {
        console.error(`❌ File not found: ${file}`);
        return;
    }

    const data = JSON.parse(fs.readFileSync(file, "utf-8"));
    const entries = data.entries;

    if (!entries || !entries.length) {
        console.log("⚠️ No entries found in the file.");
        return;
    }

    const env = await getEnvironment();
    console.log("✅ Connected to Contentful\n");

    let created = 0;
    let updated = 0;
    let failed = 0;

    for (let i = 0; i < entries.length; i++) {
        const item = entries[i];
        const fields = item.fields;
        const entryIdValue = fields.entryId["en-US"];
        const formName = fields.formName["en-US"];

        // Construct a stable Contentful ID
        const contentfulId = `form-${entryIdValue}`;

        console.log(`➡️ [${i + 1} / ${entries.length}] Importing: ${formName} (${contentfulId})`);

        try {
            const entry = await upsertEntry(env, "embedFormsCpt", contentfulId, fields, true);
            if (entry) {
                if (entry.sys.version === 1) {
                    created++;
                } else {
                    updated++;
                }
            } else {
                failed++;
            }
        } catch (err) {
            console.error(`❌ Error importing ${formName}:`, err.message);
            failed++;
        }
    }

    console.log("\n" + "=".repeat(40));
    console.log("📊 IMPORT SUMMARY");
    console.log("=".repeat(40));
    console.log(`Created: ${created}`);
    console.log(`Updated: ${updated}`);
    console.log(`Failed: ${failed}`);
    console.log("=".repeat(40));
    console.log("🚀 Import Complete");
}

run().catch(console.error);
