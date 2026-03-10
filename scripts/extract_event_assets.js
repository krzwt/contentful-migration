import fs from "fs";


const file = "./data/events.json";
const data = JSON.parse(fs.readFileSync(file, "utf-8"));

const assetMap = new Map();

// Custom extraction to include blockImage and eventPartnerLogo if they are missing
function customExtract(obj) {
    if (!obj || typeof obj !== "object") return;

    for (const [key, value] of Object.entries(obj)) {
        if (Array.isArray(value) && value.length > 0 && 
            (key.toLowerCase().includes("image") || 
             key.toLowerCase().includes("logo") || 
             key.toLowerCase().includes("pdf") || 
             key.toLowerCase().includes("video") ||
             key.toLowerCase().includes("asset") ||
             key === "resourceCardImage"
            )) {
            value.forEach(id => {
                if (typeof id === "number" || (typeof id === "string" && !isNaN(id))) {
                    assetMap.set(String(id), { type: key });
                }
            });
        }
        if (typeof value === "object") {
            customExtract(value);
        }
    }
}

customExtract(data);

console.log(`Found ${assetMap.size} unique asset IDs in ${file}:`);
const ids = Array.from(assetMap.keys()).sort((a, b) => Number(a) - Number(b));
console.log(ids.join(", "));
console.log("\nBreakdown by field type:");
const breakdown = {};
assetMap.forEach((val, id) => {
    breakdown[val.type] = (breakdown[val.type] || 0) + 1;
});
console.log(JSON.stringify(breakdown, null, 2));
