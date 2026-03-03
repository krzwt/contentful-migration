import "dotenv/config";
import fs from "fs";
import { getEnvironment } from "./config/contentful.js";

async function syncSchema() {
    const env = await getEnvironment();
    console.log("📡 Fetching all content types from Contentful...");

    let contentTypes = [];
    let skip = 0;
    const limit = 100;
    let total = 0;

    do {
        const response = await env.getContentTypes({ skip, limit });
        contentTypes = contentTypes.concat(response.items);
        total = response.total;
        skip += limit;
        console.log(`Fetched ${contentTypes.length} of ${total} content types...`);
    } while (contentTypes.length < total);

    const schema = {};

    for (const ct of contentTypes) {
        schema[ct.sys.id] = {
            name: ct.name,
            description: ct.description,
            displayField: ct.displayField,
            fields: {}
        };

        for (const field of ct.fields) {
            schema[ct.sys.id].fields[field.id] = {
                name: field.name,
                type: field.type,
                required: field.required,
                localized: field.localized,
                disabled: field.disabled
            };

            if (field.linkType) {
                schema[ct.sys.id].fields[field.id].linkType = field.linkType;
            }

            if (field.items) {
                schema[ct.sys.id].fields[field.id].items = field.items;
            }

            if (field.validations) {
                schema[ct.sys.id].fields[field.id].validations = field.validations;
            }
        }
    }

    const outputPath = "./data/contentful-schema.json";
    fs.writeFileSync(outputPath, JSON.stringify(schema, null, 2));
    console.log(`✅ Schema synced to ${outputPath} (${contentTypes.length} content types)`);
}

syncSchema().catch(err => {
    console.error("❌ Error syncing schema:", err.message);
    if (err.details) console.error("Details:", JSON.stringify(err.details, null, 2));
});
