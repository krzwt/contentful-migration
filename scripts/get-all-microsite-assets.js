/**
 * Extract all asset IDs from every page in standalone-microsite.json.
 * Use: node scripts/get-all-microsite-assets.js
 * Outputs: unique asset ID list and a Craft GraphQL query so you can fetch all
 * asset URLs once and paste into data/standalone-microsite-asset-urls.json.
 * Migration will then use direct S3 URLs for videos (no upload to Contentful).
 */
import fs from "fs";
import { extractAssets } from "../utils/assetDetector.js";

const DATA_FILE = "./data/standalone-microsite.json";

function main() {
  if (!fs.existsSync(DATA_FILE)) {
    console.error("File not found:", DATA_FILE);
    process.exit(1);
  }

  const raw = fs.readFileSync(DATA_FILE, "utf-8");
  const data = JSON.parse(raw);
  const entries = Array.isArray(data) ? data : [data];

  const allIds = new Set();
  const pageCount = entries.length;

  for (const page of entries) {
    const assetMap = extractAssets(page);
    assetMap.forEach((_info, id) => {
      const n = Number(id);
      if (!isNaN(n)) allIds.add(n);
    });
  }

  const assetIds = Array.from(allIds).sort((a, b) => a - b);

  console.log("\n📄 Microsite pages scanned:", pageCount);
  console.log("📎 Unique asset IDs across all pages:", assetIds.length);
  console.log("   IDs:", assetIds.join(", "));

  if (assetIds.length === 0) {
    console.log("\nNo assets found. Nothing to do.");
    return;
  }

  console.log("\n--- Craft GraphQL query (run once, paste result into data/standalone-microsite-asset-urls.json) ---\n");
  const idList = assetIds.join(", ");
  const query = `query AllMicrositeAssets {
  assets(id: [${idList}]) {
    id
    title
    filename
    size
    width
    height
    url
    mimeType
    dateModified
  }
}`;
  console.log(query);
  console.log("\n(If your Craft schema uses idIn: assets(idIn: [" + idList + "]) { ... })");
  console.log("\n--- Where to put the query result ---");
  console.log("  1. Run the query in Craft GraphiQL.");
  console.log("  2. Save the full response to: data/standalone-microsite-asset-urls.json");
  console.log("  3. Format must be: { \"data\": { \"assets\": [ { id, url, mimeType, title, filename, ... } ] } }");
  console.log("  4. Re-run migration; videos with url from assets.beyondtrust.com will use Video URL only (no upload).");
  console.log("\n--- Copy-paste IDs (JSON array) ---");
  console.log(JSON.stringify(assetIds));
  console.log("");
}

main();
