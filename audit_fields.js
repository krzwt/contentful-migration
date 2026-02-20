/**
 * Audit: Compare Craft source fields → Handler mapped fields → Contentful schema fields
 * Finds gaps where source data exists but isn't being migrated.
 */
import fs from "fs";

const schema = JSON.parse(fs.readFileSync("./data/contentful-schema.json", "utf8"));
const sourceData = JSON.parse(fs.readFileSync("./data/standalone-content.json", "utf8"));

// What our handlers currently SET for each content type
const HANDLER_FIELDS = {
    bannerHero: ["blockId", "blockName", "layoutVariant", "heading", "description", "removeShadow", "cta", "addAsset"],
    ctaBlock: ["blockId", "blockName", "selectBackgroundColor", "sectionTitle", "cta"],
    contentBlock: ["blockId", "blockName", "description", "sectionTitle", "cta"],
    newStandaloneContent: ["title", "slug", "sections"]
};

console.log("=".repeat(70));
console.log("FIELD AUDIT: Craft Source → Handler → Contentful Schema");
console.log("=".repeat(70));

// 1. Check Contentful schema fields vs handler fields
for (const [ctId, handlerFields] of Object.entries(HANDLER_FIELDS)) {
    const ct = schema[ctId];
    if (!ct) {
        console.log(`\n❌ Content type "${ctId}" NOT FOUND in Contentful schema!`);
        continue;
    }

    console.log(`\n📦 ${ct.name} (${ctId})`);
    console.log("-".repeat(50));

    const schemaFields = Object.keys(ct.fields);

    // Fields in Contentful but NOT set by handler
    const notMapped = schemaFields.filter(f => !handlerFields.includes(f));
    // Fields set by handler but NOT in Contentful
    const extraInHandler = handlerFields.filter(f => !schemaFields.includes(f));

    console.log(`  Contentful fields: ${schemaFields.join(", ")}`);
    console.log(`  Handler sets:      ${handlerFields.join(", ")}`);

    if (notMapped.length) {
        console.log(`\n  ⚠️  NOT MAPPED (in Contentful but handler doesn't set):`);
        for (const f of notMapped) {
            const fi = ct.fields[f];
            const opts = fi.validations?.find(v => v.type === "in");
            console.log(`     - ${f} (${fi.type}${fi.required ? ", REQUIRED" : ""})${opts ? " → Options: " + opts.values.join(", ") : ""}`);
        }
    } else {
        console.log(`  ✅ All Contentful fields are mapped!`);
    }

    if (extraInHandler.length) {
        console.log(`\n  🛑 EXTRA (handler sets but NOT in Contentful schema):`);
        for (const f of extraInHandler) {
            console.log(`     - ${f}`);
        }
    }
}

// 2. Check what Craft source fields exist but aren't used
console.log("\n" + "=".repeat(70));
console.log("SOURCE DATA FIELD ANALYSIS");
console.log("=".repeat(70));

// Collect all unique fields per component type from source JSON
const sourceFieldsByType = {};

for (const page of sourceData) {
    for (const key of Object.keys(page)) {
        const val = page[key];
        if (val && typeof val === "object" && !Array.isArray(val) && Object.keys(val).length > 0 && !isNaN(Object.keys(val)[0])) {
            for (const blockId of Object.keys(val)) {
                const block = val[blockId];
                const type = block.type || key;
                if (!sourceFieldsByType[type]) sourceFieldsByType[type] = new Set();
                if (block.fields) {
                    Object.keys(block.fields).forEach(f => sourceFieldsByType[type].add(f));
                }
            }
        }
    }
}

for (const [type, fields] of Object.entries(sourceFieldsByType)) {
    const fieldArr = [...fields].sort();
    console.log(`\n📋 Craft "${type}" source fields (${fieldArr.length}):`);
    console.log(`   ${fieldArr.join(", ")}`);
}
