/**
 * Standalone Asset Upload Script
 * Run: npm run assets
 * 
 * Uploads ALL assets to Contentful first, then page migration is fast.
 * Also publishes any existing Draft assets.
 */
import "dotenv/config";
import fs from "fs";
import { getEnvironment } from "./config/contentful.js";
import { loadAssetMetadata, uploadAsset, loadWistiaData, getWistiaData } from "./utils/assetUploader.js";
import { extractAssets } from "./utils/assetDetector.js";

const ASSET_METADATA_FILE = "./data/assets.json";

const DATA_SOURCES = [
    // {
    //   file: "./data/standalone-content.json",
    //   label: "Standalone Content"
    // },
    {
        file: "./data/standalone-conversion.json",
        label: "Standalone Conversion"
    }
];

async function run() {
    const env = await getEnvironment();
    const assetMetadata = loadAssetMetadata(ASSET_METADATA_FILE);
    loadWistiaData(); // Load data/wistia.json if exists
    console.log(`📦 Loaded ${assetMetadata.size} asset metadata entries\n`);

    // Collect ALL unique asset IDs across all sources
    const allAssetIds = new Set();

    for (const source of DATA_SOURCES) {
        const data = JSON.parse(fs.readFileSync(source.file, "utf-8"));
        console.log(`📂 Scanning: ${source.label} (${data.length} pages)`);

        for (const pageData of data) {
            const pageAssets = extractAssets(pageData);
            pageAssets.forEach((val, assetId) => allAssetIds.add(String(assetId)));
        }
    }

    console.log(`\n📊 Total unique asset references: ${allAssetIds.size}`);

    // Separate by what we have metadata for vs missing
    const withMeta = [];
    const missingMeta = [];
    const wistiaAssets = [];

    for (const id of allAssetIds) {
        if (getWistiaData(id)) {
            wistiaAssets.push(id);
        } else if (assetMetadata.has(id)) {
            withMeta.push(id);
        } else {
            missingMeta.push(id);
        }
    }

    console.log(`   ✅ Have metadata (files): ${withMeta.length}`);
    console.log(`   🎬 Wistia videos: ${wistiaAssets.length}`);
    console.log(`   ❌ Missing metadata: ${missingMeta.length}`);

    if (missingMeta.length > 0) {
        console.log(`\n⚠️  Missing asset IDs (need GraphQL query):`);
        console.log(`   ${missingMeta.join(", ")}`);
    }

    // Upload assets with metadata
    console.log(`\n🚀 Uploading ${withMeta.length} assets...\n`);

    let uploaded = 0;
    let failed = 0;
    let skipped = 0;

    for (let i = 0; i < withMeta.length; i++) {
        const craftId = withMeta[i];
        const meta = assetMetadata.get(craftId);
        const progress = `[${i + 1}/${withMeta.length}]`;

        console.log(`${progress} ${meta.title} (craft: ${craftId})`);

        const contentfulId = await uploadAsset(env, craftId, meta);
        if (contentfulId) {
            uploaded++;
        } else {
            failed++;
        }
    }

    console.log(`\n========================================`);
    console.log(`📊 ASSET UPLOAD SUMMARY`);
    console.log(`========================================`);
    console.log(`   ✅ Uploaded/Existing: ${uploaded}`);
    console.log(`   ❌ Failed: ${failed}`);
    console.log(`   ⚠️  Missing metadata: ${missingMeta.length}`);
    console.log(`   📊 Total: ${allAssetIds.size}`);
    console.log(`\n🏁 Done! Now run: npm run migrate`);
}

run().catch(err => {
    console.error("Fatal error:", err);
    process.exit(1);
});
