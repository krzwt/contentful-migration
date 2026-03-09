import fs from "fs";
import { loadAssetMetadata, loadWistiaData, getWistiaData } from "../utils/assetUploader.js";
import { extractAssets } from "../utils/assetDetector.js";

const ASSET_METADATA_FILES = [
  "./data/assets.json",
  "./data/people-assets.json",
  "./data/quote-assets.json",
  "./data/resource-assets.json",
  "./data/missing-fixed.json",
];

const BLOG_FILE = process.argv[2] ? `./data/${process.argv[2]}` : "./data/new-blog.json";

async function run() {
  if (!fs.existsSync(BLOG_FILE)) {
    console.error(`File not found: ${BLOG_FILE}`);
    return;
  }

  const assetMetadata = loadAssetMetadata(ASSET_METADATA_FILES);
  loadWistiaData();
  console.log(`📚 Loaded ${assetMetadata.size} asset metadata entries`);

  const blogData = JSON.parse(fs.readFileSync(BLOG_FILE, "utf-8"));
  console.log(`📂 Scanning: ${BLOG_FILE} (${blogData.length} entries)`);

  const allAssetIds = new Map();
  for (const entry of blogData) {
    const assets = extractAssets(entry);
    assets.forEach((info, id) => {
      if (!allAssetIds.has(id)) {
        allAssetIds.set(id, { ...info, pageTitle: entry.title });
      }
    });
  }

  console.log(`📊 Found ${allAssetIds.size} unique asset references\n`);

  const missingIds = [];
  const foundIds = [];

  for (const [id, info] of allAssetIds.entries()) {
    if (assetMetadata.has(id)) {
      foundIds.push(id);
    } else if (getWistiaData(id)) {
      foundIds.push(id);
      console.log(`   🎬 Found Wistia asset: ${id}`);
    } else {
      missingIds.push({ id, ...info });
    }
  }

  if (missingIds.length > 0) {
    console.log(`⚠️ MISSING ASSET METADATA (${missingIds.length}):`);
    missingIds.forEach(m => {
      console.log(`   ID: ${m.id} | Type: ${m.type} | Page: ${m.pageTitle}`);
    });
    console.log(`\nIDs for copy-paste: ${missingIds.map(m => m.id).join(", ")}`);
  } else {
    console.log("✅ No missing assets found!");
  }
}

run().catch(console.error);
