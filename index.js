import fs from "fs";
import { getEnvironment } from "./config/contentful.js";
import { COMPONENTS } from "./registry.js";
import { attachHeroToPage, getOrCreatePage } from "./handlers/pageHandler.js";
import { genericComponentHandler } from "./handlers/genericComponent.js";
import { logAssets, extractAssets } from "./utils/assetDetector.js";
import { loadAssetMetadata, processAssets } from "./utils/assetUploader.js";

const isDryRun = false; // Set to true to simulate migration without making changes
const ASSET_METADATA_FILE = "./data/assets.json"; // GraphQL asset metadata

async function run() {
  const env = isDryRun ? null : await getEnvironment();
  const summary = {
    processed: 0,
    updated: 0,
    created: 0,
    skipped: [],
    missingMappings: new Map(), // type -> fields[]
    missingAssetMetadata: []
  };

  const data = JSON.parse(fs.readFileSync("./data/standalone-content.json", "utf-8"));

  // Load asset metadata
  const assetMetadata = loadAssetMetadata(ASSET_METADATA_FILE);
  console.log(`📚 Loaded ${assetMetadata.size} asset metadata entries\n`);

  if (isDryRun) {
    console.log("🏃 Running in DRY RUN mode. No changes will be made to Contentful.\n");
    logAssets(data, assetMetadata);
  } else {
    console.log("✅ Connected to Contentful\n");
  }

  // Detect all asset IDs in the page JSON and upload/map them in Contentful
  const detectedAssets = extractAssets(data);
  const assetIds = Array.from(detectedAssets.keys());

  console.log(`📎 Found ${assetIds.length} unique asset references in page data\n`);

  const { assetMap: contentfulAssetMap, missingIds } = await processAssets(env, assetIds, assetMetadata, isDryRun);
  summary.missingAssetMetadata = missingIds;

  for (const pageData of data) {
    console.log("\n➡️ Page:", pageData.title);
    const { slug, title } = pageData;

    let pageEntry = null;
    if (!isDryRun) {
      pageEntry = await getOrCreatePage(env, { title, slug });
      if (!pageEntry) {
        console.error(`🛑 Skipping page "${title}" because page entry could not be created/found.`);
        continue;
      }
    }

    // 1. Automatically find component fields in the JSON
    const componentFields = Object.keys(pageData).filter(key => {
      const val = pageData[key];
      return val && typeof val === "object" && !Array.isArray(val) &&
        Object.keys(val).length > 0 && !isNaN(Object.keys(val)[0]);
    });

    for (const fieldKey of componentFields) {
      const components = pageData[fieldKey];

      for (const blockId in components) {
        const block = components[blockId];
        if (!block.enabled) continue;

        const fields = block.fields;
        const type = block.type || fieldKey;

        const config = COMPONENTS[type];
        if (!config) {
          if (!summary.missingMappings.has(type)) {
            summary.missingMappings.set(type, Object.keys(fields || {}));
          }
          console.warn(`ℹ️ skipping: "${type}" (no mapping in registry.js)`);
          continue;
        }

        console.log(`✅ Detected "${type}" (ID: ${blockId})`);

        if (isDryRun) {
          console.log(`   [DRY RUN] Would process ${type} using ${config.handler.name}`);
          continue;
        }

        try {
          let heroEntry;
          if (config.handler === genericComponentHandler) {
            const entryId = await genericComponentHandler(
              env,
              { id: blockId, ...fields },
              config.mapping,
              contentfulAssetMap
            );
            if (entryId) {
              heroEntry = await env.getEntry(entryId);
            }
          } else {
            heroEntry = await config.handler(
              env,
              {
                blockId: blockId,
                ...fields, // Pass all fields from source
                heading: fields.headingSection || pageData.heading45 || title,
                body: fields.body180 || fields.bodyRedactorRestricted || fields.description,
                label: fields.label || fields.ctaLinkText,
                variation: type
              },
              contentfulAssetMap
            );
          }

          if (heroEntry && pageEntry) {
            pageEntry = await attachHeroToPage(env, pageEntry, heroEntry);
          }
        } catch (err) {
          console.error(`❌ Error processing ${type} (${blockId}):`, err.message);
          summary.skipped.push({ page: title, blockId, type, error: err.message });
        }
      }
    }
  }

  console.log("\n" + "=".repeat(40));
  console.log("📊 MIGRATION SUMMARY");
  console.log("=".repeat(40));

  if (summary.missingAssetMetadata.length > 0) {
    console.log("\n⚠️  MISSING ASSET METADATA (Add these to assets.json):");
    console.log(`   IDs: ${summary.missingAssetMetadata.join(", ")}`);
  }

  if (summary.missingMappings.size > 0) {
    console.log("\n⚠️  MISSING MAPPINGS (Add these to registry.js):");
    for (const [type, fields] of summary.missingMappings.entries()) {
      console.log(`\n   Type: "${type}"`);
      console.log(`   Sample Fields: ${fields.join(", ")}`);
    }
  }

  if (summary.skipped.length > 0) {
    console.log("\n❌ FAILED BLOCKS:");
    summary.skipped.forEach(s => console.log(`   - [${s.page}] ${s.type} (${s.blockId}): ${s.error}`));
  }

  console.log("\n🚀 Migration Complete");
}

run().catch(console.error);