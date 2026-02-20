/**
 * Export all Contentful content types with their fields, types, and validations
 * into a JSON reference file for easy Craft → Contentful field mapping.
 *
 * Usage:  node export_content_types.js
 * Output: data/contentful-schema.json
 */
import { getEnvironment } from "./config/contentful.js";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

async function exportSchema() {
    const env = await getEnvironment();
    const contentTypes = await env.getContentTypes({ limit: 100 });

    console.log(`📦 Found ${contentTypes.items.length} content types\n`);

    const schema = {};

    for (const ct of contentTypes.items) {
        const ctEntry = {
            name: ct.name,
            description: ct.description || "",
            displayField: ct.displayField || "",
            fields: {}
        };

        for (const field of ct.fields) {
            const fieldInfo = {
                name: field.name,
                type: field.type,
                required: field.required || false,
                localized: field.localized || false,
                disabled: field.disabled || false
            };

            // For Link fields, show what they link to
            if (field.type === "Link") {
                fieldInfo.linkType = field.linkType; // "Entry" or "Asset"
            }

            // For Array fields, show item type
            if (field.type === "Array" && field.items) {
                fieldInfo.items = {
                    type: field.items.type,
                    linkType: field.items.linkType || undefined
                };
                // Item-level validations (e.g. allowed content types)
                if (field.items.validations?.length) {
                    fieldInfo.items.validations = field.items.validations;
                }
            }

            // Extract validations (dropdown options, regex, size, etc.)
            if (field.validations?.length) {
                fieldInfo.validations = field.validations.map(v => {
                    // "in" validation = dropdown/select options
                    if (v.in) return { type: "in", values: v.in };
                    // "linkContentType" = allowed linked content types
                    if (v.linkContentType) return { type: "linkContentType", allowed: v.linkContentType };
                    // "linkMimetypeGroup" = allowed asset types
                    if (v.linkMimetypeGroup) return { type: "linkMimetypeGroup", allowed: v.linkMimetypeGroup };
                    // "size" = min/max
                    if (v.size) return { type: "size", ...v.size };
                    // "regexp" = pattern
                    if (v.regexp) return { type: "regexp", pattern: v.regexp.pattern };
                    // "unique" = must be unique
                    if (v.unique) return { type: "unique" };
                    // Anything else, return as-is
                    return v;
                });
            }

            ctEntry.fields[field.id] = fieldInfo;
        }

        schema[ct.sys.id] = ctEntry;
        console.log(`  ✅ ${ct.name} (${ct.sys.id}) — ${ct.fields.length} fields`);
    }

    // Write to file
    const outPath = path.resolve("data", "contentful-schema.json");
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(schema, null, 2), "utf8");

    console.log(`\n📄 Schema exported to: ${outPath}`);
    console.log(`   ${Object.keys(schema).length} content types`);
    console.log(`   ${Object.values(schema).reduce((sum, ct) => sum + Object.keys(ct.fields).length, 0)} total fields`);
}

exportSchema().catch(err => {
    console.error("❌ Error:", err.message);
    process.exit(1);
});
