import fs from "fs";

const data = JSON.parse(fs.readFileSync("./data/standalone-conversion.json", "utf8"));

console.log("Total entries:", data.length);
console.log("\n=== COMPONENT FIELD ANALYSIS ===\n");

const componentsByType = {};
const pageComponentFields = new Set();

for (const page of data) {
    // Find all component matrix fields
    for (const key of Object.keys(page)) {
        const val = page[key];
        if (val && typeof val === "object" && !Array.isArray(val) && Object.keys(val).length > 0 && !isNaN(Object.keys(val)[0])) {
            pageComponentFields.add(key);
            for (const bid of Object.keys(val)) {
                const block = val[bid];
                const type = block.type || key;
                if (!componentsByType[type]) {
                    componentsByType[type] = { count: 0, fields: new Set(), sampleBlockId: bid, samplePage: page.title };
                }
                componentsByType[type].count++;
                if (block.fields) {
                    Object.keys(block.fields).forEach(f => componentsByType[type].fields.add(f));
                }
            }
        }
    }
}

console.log("Component matrix fields found:", [...pageComponentFields].join(", "));
console.log("\n--- Component Types ---\n");

for (const [type, info] of Object.entries(componentsByType).sort((a, b) => b[1].count - a[1].count)) {
    console.log(`${type} (${info.count} blocks)`);
    console.log(`  Fields: ${[...info.fields].join(", ")}`);
    console.log(`  Sample: block ${info.sampleBlockId} on "${info.samplePage}"`);
    console.log();
}
