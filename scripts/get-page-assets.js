/**
 * Extract all asset IDs for a single page from standalone-microsite.json.
 * Use: node scripts/get-page-assets.js [pageId]
 * Default pageId: 1604433 (Go Beyond 2024 Recap Videos)
 * Outputs: asset ID list and a Craft GraphQL query to run for asset details (size, url, etc.).
 */
import fs from "fs";
import { extractAssets } from "../utils/assetDetector.js";

const DATA_FILE = "./data/standalone-microsite.json";
const PAGE_ID = process.argv[2] ? String(process.argv[2]) : "1604433";

function main() {
  if (!fs.existsSync(DATA_FILE)) {
    console.error("File not found:", DATA_FILE);
    process.exit(1);
  }

  const raw = fs.readFileSync(DATA_FILE, "utf-8");
  const data = JSON.parse(raw);
  const entries = Array.isArray(data) ? data : [data];

  const page = entries.find((p) => String(p.id) === PAGE_ID);
  if (!page) {
    console.error("Page not found with id:", PAGE_ID);
    console.error("Available IDs (first 5):", entries.slice(0, 5).map((p) => p.id));
    process.exit(1);
  }

  const assetMap = extractAssets(page);
  const assetIds = Array.from(assetMap.keys()).map(Number).filter((n) => !isNaN(n)).sort((a, b) => a - b);

  console.log("\n📄 Page:", page.title, "(id:", page.id, ")");
  console.log("   URI:", page.uri || page.slug);
  console.log("\n📎 All asset IDs on this page:", assetIds.length);
  console.log("   IDs:", assetIds.join(", "));
  console.log("\n--- By type ---");
  const byType = {};
  assetMap.forEach((info, id) => {
    const t = info.type || "unknown";
    if (!byType[t]) byType[t] = [];
    byType[t].push(id);
  });
  Object.entries(byType).forEach(([type, ids]) => {
    console.log("   ", type + ":", ids.join(", "));
  });

  // Craft GraphQL: use idIn for multiple IDs (Craft AssetQuery)
  console.log("\n--- Craft GraphQL query (run in GraphiQL / Run query) ---\n");
  const idList = assetIds.join(", ");
  const query = `query PageAssets {
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
  // Alternative if your schema uses idIn: assets(idIn: [${idList}])
  console.log(query);
  console.log("\n(If your Craft schema uses idIn instead of id with array, use: assets(idIn: [" + idList + "]) { ... })");
  console.log("\n--- Where to put the query result ---");
  console.log("  Save the GraphQL response to: data/standalone-microsite-asset-urls.json");
  console.log("  Format: { \"data\": { \"assets\": [ { id, url, mimeType, title, filename, ... } ] } }");
  console.log("  Videos with url from assets.beyondtrust.com will use direct URL (no upload to Contentful).");
  console.log("  See data/ASSET-URLS-README.md for details.");
  console.log("\n--- Copy-paste IDs for manual use ---");
  console.log(JSON.stringify(assetIds));
  console.log("");
}

main();
