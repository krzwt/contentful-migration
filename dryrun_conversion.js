import fs from "fs";
import { COMPONENTS } from "./registry.js";

const data = JSON.parse(fs.readFileSync("./data/standalone-conversion.json", "utf8"));

const missing = new Map();
let handled = 0;
let skipped = 0;

for (const page of data) {
    for (const key of Object.keys(page)) {
        const val = page[key];
        if (val && typeof val === "object" && !Array.isArray(val) && Object.keys(val).length > 0 && !isNaN(Object.keys(val)[0])) {
            for (const bid of Object.keys(val)) {
                const block = val[bid];
                if (!block.enabled) continue;
                const type = block.type || key;
                if (COMPONENTS[type]) {
                    handled++;
                } else {
                    skipped++;
                    if (!missing.has(type)) missing.set(type, { count: 0, fields: Object.keys(block.fields || {}) });
                    missing.get(type).count++;
                }
            }
        }
    }
}

console.log("=".repeat(50));
console.log("STANDALONE CONVERSION — DRY RUN ANALYSIS");
console.log("=".repeat(50));
console.log(`\nTotal blocks: ${handled + skipped}`);
console.log(`✅ Can handle: ${handled} blocks`);
console.log(`❌ Missing handler: ${skipped} blocks`);
console.log(`\n--- Missing Types (need handlers in registry.js) ---\n`);

const sorted = [...missing.entries()].sort((a, b) => b[1].count - a[1].count);
for (const [type, info] of sorted) {
    console.log(`  ${type} (${info.count} blocks)`);
    console.log(`    Fields: ${info.fields.join(", ")}`);
}
