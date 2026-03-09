import fs from "fs";
import { getEnvironment } from "./config/contentful.js";
import { COMPONENTS } from "./registry.js";
import {
  setSectionsOnPage,
  getOrCreatePage,
  publishPage,
} from "./handlers/pageHandler.js";
import { migratePeople } from "./handlers/peopleHandler.js";
import { migrateQuotes } from "./handlers/quoteHandler.js";
import { migrateResources } from "./handlers/resourceHandler.js";
import { migrateGlobalReachMap } from "./handlers/newGlobalReachMap.js";
import { migratePodcasts } from "./handlers/podcastHandler.js";
import { migrateStBtu } from "./handlers/newStBtu.js";
import { migrateSt } from "./handlers/newSt.js";
import { migrateForms } from "./handlers/formHandler.js";
import { migratePressMedia } from "./handlers/pressMediaHandler.js";
import { genericComponentHandler } from "./handlers/genericComponent.js";
import { logAssets, extractAssets } from "./utils/assetDetector.js";
import {
  loadAssetMetadata,
  processAssets,
  loadWistiaData,
  prePopulateAssetCache,
} from "./utils/assetUploader.js";
import { buildUrlMap } from "./utils/contentfulHelpers.js";
import { loadCategories } from "./utils/categoryLoader.js";
import { loadTagMapping } from "./utils/tagHandler.js";
import { getOrderedKeys } from "./utils/jsonOrder.js";

const LOCALE = "en-US";
const isDryRun = false; // Set to true to simulate migration without making changes
const ASSET_METADATA_FILES = [
  "./data/assets.json",
  "./data/people-assets.json",
  "./data/quote-assets.json",
  "./data/resource-assets.json",
  "./data/missing-fixed.json",
]; // GraphQL asset metadata

/* ---------------------------------------------------------
   CLI args: node index.js [--from N] [--to N] [--dry]
   Examples:
     npm run migrate                   → all pages
     npm run migrate -- --from 1 --to 10   → pages 1-10
     npm run migrate -- --from 11 --to 20  → pages 11-20
     npm run migrate -- --dry              → dry run all
--------------------------------------------------------- */
const args = process.argv.slice(2);
const fromArg =
  args.indexOf("--from") !== -1
    ? parseInt(args[args.indexOf("--from") + 1])
    : null;
const toArg =
  args.indexOf("--to") !== -1 ? parseInt(args[args.indexOf("--to") + 1]) : null;
const idArg =
  args.indexOf("--id") !== -1 ? args[args.indexOf("--id") + 1] : null;
const cliDryRun = args.includes("--dry");
const effectiveDryRun = isDryRun || cliDryRun;

/* ---------------------------------------------------------
   DATA SOURCES
   Each source defines its JSON file and Contentful page type
--------------------------------------------------------- */
const DATA_SOURCES = [
  // {
  //   file: "./data/standalone-content.json",
  //   // file: "./data/test-sc.json",
  //   pageContentType: "newStandaloneContent",
  //   label: "Standalone Content",
  // },
  // {
  //   file: "./data/standalone-conversion.json",
  //   pageContentType: "newStandaloneConversion",
  //   label: "Standalone Conversion"
  // },
  // {
  //   file: "./data/standalone-microsite.json",
  //   pageContentType: "newStandaloneMicrosite",
  //   label: "Standalone Microsite",
  // },
  // {
  //   file: "./data/standalone-thankyou.json",
  //   pageContentType: "newStandaloneThankYou",
  //   label: "Standalone Thank You",
  // },
  // {
  //   file: "./data/newPartners.json",
  //   pageContentType: "newPartners",
  //   label: "Partners"
  // },
  // {
  //   file: "./data/people-cpt.json",
  //   label: "People CPT",
  //   isPeople: true
  // },
  // {
  //   file: "./data/company-quotes.json",
  //   label: "Company Quotes",
  //   isQuotes: true
  // },
  // {
  //   file: "./data/resources-cpt.json",
  //   label: "Resources CPT",
  //   isResources: true
  // }
  // {
  //   file: "./data/newGlobalReachMap.json",
  //   label: "Global Reach Map",
  //   isGlobalReachMap: true
  // }
  {
    file: "./data/newPodcasts.json",
    label: "Podcasts CPT",
    isPodcasts: true
  },
  //{
  //   file: "./data/new-S&T-BTU.json",
  //   label: "S&T BTU",
  //   isStBtu: true
  // },
  // {
  //   file: "./data/new-S&T.json",
  //   label: "S&T",
  //   isSt: true
  // },
  // {
  //   file: "./data/forms-import.json",
  //   label: "Forms Import",
  //   isForms: true
  // },
  // {
  //   file: "./data/new-press&media.json",
  //   label: "Press & Media",
  //   isPressMedia: true
  // }
];

async function run() {
  const env = effectiveDryRun ? null : await getEnvironment();
  if (env) await prePopulateAssetCache(env);

  buildUrlMap(); // Build ID -> URL lookup map
  loadCategories(); // Load general-categories.json
  loadTagMapping(); // Load data/tags.json

  const summary = {
    processed: 0,
    updated: 0,
    created: 0,
    skipped: [],
    missingMappings: new Map(), // type -> fields[]
    missingAssetMetadata: [],
    missingResources: new Set(),
  };

  // Load asset metadata
  const assetMetadata = loadAssetMetadata(ASSET_METADATA_FILES);
  loadWistiaData(); // Load data/wistia.json if exists
  console.log(`📚 Loaded ${assetMetadata.size} asset metadata entries\n`);

  if (effectiveDryRun) {
    console.log(
      "🏃 Running in DRY RUN mode. No changes will be made to Contentful.\n",
    );
  } else {
    console.log("✅ Connected to Contentful\n");
  }

  if (fromArg || toArg) {
    console.log(`📋 Batch mode: pages ${fromArg || 1} to ${toArg || "end"} \n`);
  }

  /* ---------------------------------------------------------
     Process each data source
  --------------------------------------------------------- */
  for (const source of DATA_SOURCES) {
    if (!fs.existsSync(source.file)) {
      console.log(
        `\n⚠️ Skipping "${source.label}" — file not found: ${source.file} `,
      );
      continue;
    }

    const dataRaw = JSON.parse(fs.readFileSync(source.file, "utf-8"));
    const data = Array.isArray(dataRaw) ? dataRaw : (dataRaw.entries || [dataRaw]);

    if (!data || (Array.isArray(data) && !data.length)) {
      console.log(`\n⚠️ Skipping "${source.label}" — empty or invalid file`);
      continue;
    }

    // Determine which indices to process
    let targetIndices = [];
    if (idArg) {
      const targetIds = String(idArg).split(",").map((id) => id.trim());
      targetIndices = data
        .map((p, i) => (targetIds.includes(String(p.id)) ? i : -1))
        .filter((i) => i !== -1);

      if (targetIndices.length === 0) {
        console.warn(`⚠️ Entry ID(s) "${idArg}" not found in ${source.file}`);
        continue;
      }
    } else {
      const start = (fromArg || 1) - 1;
      const end = toArg ? Math.min(toArg, data.length) : data.length;
      for (let i = start; i < end; i++) targetIndices.push(i);
    }

    const batchData = targetIndices.map((idx) => data[idx]);

    console.log("\n" + "=".repeat(50));
    const rangeStr = idArg
      ? `ID: ${idArg}`
      : `pages ${targetIndices[0] + 1} - ${targetIndices[targetIndices.length - 1] + 1}`;
    console.log(
      `📂 Processing: ${source.label} (${rangeStr} of ${data.length} → ${source.pageContentType || "People"})`,
    );
    console.log("=".repeat(50));

    // Detect all asset IDs from BATCH and upload/map them
    // (assets are likely already uploaded via `npm run assets`)
    const allDetected = new Map();
    for (const pageData of batchData) {
      const pageAssets = extractAssets(pageData);
      pageAssets.forEach((v, k) => allDetected.set(k, v));
    }
    const assetIds = Array.from(allDetected.keys());
    console.log(`📎 Found ${assetIds.length} asset references in this batch\n`);

    if (effectiveDryRun) {
      logAssets(data, assetMetadata);
    }

    // lookupOnly=true: just find existing assets by title (no upload/wait)
    // Assets should already be uploaded via: npm run assets
    const { assetMap: contentfulAssetMap, missingIds } = await processAssets(
      env,
      assetIds,
      assetMetadata,
      effectiveDryRun,
      true,
      summary,
    );
    summary.missingAssetMetadata.push(...missingIds);

    const totalPages = data.length;
    // Load the JSON as raw text for preserving key order (JS sorts numeric keys)
    const rawFileContent = fs.readFileSync(source.file, "utf8");

    if (source.pageContentType) {
      const displayTotal = targetIndices[targetIndices.length - 1] + 1;
      for (let i = 0; i < batchData.length; i++) {
        const pageData = batchData[i];

        // Helper to find original order of keys in the raw JSON file
        const getFieldSegment = (fieldName) => {
          // Find page and field segment in raw text
          const pId = String(pageData.id);
          const pIdx = rawFileContent.indexOf(`"id": ${pId}`);
          if (pIdx === -1) return "";

          const fIdx = rawFileContent.indexOf(`"${fieldName}":`, pIdx);
          if (fIdx === -1) return "";

          const nextPIdx = rawFileContent.indexOf('"id":', fIdx + 20);
          return rawFileContent.substring(
            fIdx,
            nextPIdx === -1 ? undefined : nextPIdx,
          );
        };

        const pageNum = targetIndices[i] + 1;
        console.log(
          `\n➡️ [${pageNum} / ${displayTotal}] Page: ${pageData.title} (entryId: ${pageData.id || "N/A"})`,
        );
        const { slug, title, uri } = pageData;
        // Use uri as slug (includes parent path, e.g. "sem/remote-access-new")
        const fullSlug = uri || slug;

        let pageEntry = null;
        if (effectiveDryRun) {
          // Show parent/child relationship in dry run
          if (pageData.parentId) {
            const parentPage = data.find(
              (p) => String(p.id) === String(pageData.parentId),
            );
            const parentTitle = parentPage
              ? parentPage.title
              : `[NOT IN JSON: ${pageData.parentId}]`;
            const parentSlug = parentPage ? parentPage.slug : "unknown";
            console.log(
              `   📂 Parent: "${parentTitle}"(slug: ${parentSlug}) → settings.parentPage`,
            );
            console.log(`   🔗 Slug: /${fullSlug}`);
          } else {
            console.log(`   📂 Root page (no parent) → /${fullSlug}`);
          }
        } else {
          pageEntry = await getOrCreatePage(
            env,
            {
              ...pageData,
              title,
              slug: fullSlug,
            },
            source.pageContentType,
            data,
            contentfulAssetMap,
          );

          if (!pageEntry) {
            console.error(
              `🛑 Skipping page "${title}" because page entry could not be created/found.`,
            );
            continue;
          }
        }

        // Collect ALL section entries in order, then set sections array at once
        const sectionEntries = [];
        let navigationEntryLink = null;
        let overwriteParentCtaLink = null;

        // Detect component fields in the JSON (keys with numeric sub-keys)
        const componentFields = Object.keys(pageData).filter((key) => {
          const val = pageData[key];
          return (
            val &&
            typeof val === "object" &&
            !Array.isArray(val) &&
            Object.keys(val).length > 0 &&
            !isNaN(Object.keys(val)[0])
          );
        });

        for (const fieldKey of componentFields) {
          const components = pageData[fieldKey];
          const fieldSegment = getFieldSegment(fieldKey);
          const orderedIds = getOrderedKeys(fieldSegment, components);

          for (let k = 0; k < orderedIds.length; k++) {
            const blockId = orderedIds[k];
            const block = components[blockId];
            if (!block.enabled) continue;

            const bFields = block.fields;
            const bType = block.type || fieldKey;

            // --- Lookahead Merge Logic ---
            let mergedCtaEntry = null;
            const nextBId = orderedIds[k + 1];
            if (bType === 'contentBlock' && nextBId) {
              const nextBlock = components[nextBId];
              const nextType = nextBlock.type || fieldKey;
              // Only merge simple 'cta' / 'calloutBar' that DON'T have a heading (as they act as CTAs for the content block)
              // Actually, most calloutBars have their own headings, so let's only merge 'cta' or truly empty-looking calloutBars.
              if (nextBlock.enabled && (nextType === 'cta' || (nextType === 'calloutBar' && !nextBlock.fields.headingSection))) {
                console.log(`🔗 Lookahead: Merging ${nextType} (${nextBId}) into contentBlock (${blockId})`);

                // Process the CTA block first to get its entry
                const ctaConfig = COMPONENTS[nextType];
                if (ctaConfig) {
                  const ctaResult = await ctaConfig.handler(env, {
                    blockId: nextBId,
                    ...nextBlock.fields,
                    label: nextBlock.fields.label || nextBlock.fields.ctaLinkText,
                    variation: nextType,
                  }, contentfulAssetMap, summary);

                  if (ctaResult) {
                    // Extract the CTA entry from the CTA Block results
                    // ctaBlock handler returns the ctaBlock entry, but we want the cta entry inside it?
                    // Actually, the ctaBlock handler returns the result of upsertEntry(ctaBlock).
                    // We need the ACTUAL 'cta' type entry.
                    // Wait, our contentBlock.js now expects fullWidthCta to be an entry.

                    // Let's check ctaBlock.js again. It returns the ctaBlock entry.
                    // But we want the CTA field of that entry?
                    // Better: just pass the raw data and let contentBlock handler handle it.
                    mergedCtaEntry = nextBlock.fields;
                    k++; // Skip the next block in the loop
                  }
                }
              }
            }

            // Extract block segment for nested ordering
            const bIdx = fieldSegment.indexOf(`"${blockId}":`);
            const endBId = orderedIds[k + 1]; // Use updated k
            const nextBIdx = endBId
              ? fieldSegment.indexOf(`"${endBId}":`)
              : fieldSegment.length;
            const blockSegment = fieldSegment.substring(bIdx, nextBIdx);

            const fields = block.fields;
            const type = bType;

            const config = COMPONENTS[type];
            if (!config) {
              if (!summary.missingMappings.has(type)) {
                summary.missingMappings.set(type, Object.keys(fields || {}));
              }
              console.warn(
                `ℹ️ skipping: "${type}" (no mapping in registry.js)`,
              );
              continue;
            }

            console.log(`✅ Detected "${type}" (ID: ${blockId})`);

            if (effectiveDryRun) {
              console.log(
                `   [DRY RUN] Would process ${type} using ${config.handler.name}`,
              );
              continue;
            }

            try {
              let heroEntry;
              if (config.handler === genericComponentHandler) {
                const entryId = await genericComponentHandler(
                  env,
                  { id: blockId, ...fields },
                  config.mapping,
                  contentfulAssetMap,
                  summary,
                );
                if (entryId) {
                  heroEntry = await env.getEntry(entryId);
                }
              } else {
                heroEntry = await config.handler(
                  env,
                  {
                    blockId: blockId,
                    blockSegment: blockSegment,
                    ...fields, // Pass all fields from source
                    fullWidthCta: mergedCtaEntry, // Pass merged CTA data if any
                    heading:
                      fields.headingSection ||
                      fields.heading ||
                      fields.heroTitle ||
                      pageData.heading45 ||
                      title,
                    body:
                      fields.body180 ||
                      fields.bodyRedactorRestricted ||
                      fields.description ||
                      fields.heroDescription ||
                      fields.subheading,
                    label: fields.label || fields.ctaLinkText,
                    variation: type,
                  },
                  contentfulAssetMap,
                  summary,
                );
              }

              if (heroEntry) {
                if (Array.isArray(heroEntry)) {
                  if (fieldKey === 'sectionNavigation') {
                    if (type === 'overwriteParentCta') {
                      overwriteParentCtaLink = { sys: { type: "Link", linkType: "Entry", id: heroEntry[0].sys.id } };
                    } else {
                      navigationEntryLink = { sys: { type: "Link", linkType: "Entry", id: heroEntry[0].sys.id } };
                    }
                  } else {
                    sectionEntries.push(...heroEntry);
                  }
                } else {
                  if (fieldKey === 'sectionNavigation') {
                    if (type === 'overwriteParentCta') {
                      overwriteParentCtaLink = { sys: { type: "Link", linkType: "Entry", id: heroEntry.sys.id } };
                    } else {
                      navigationEntryLink = { sys: { type: "Link", linkType: "Entry", id: heroEntry.sys.id } };
                    }
                  } else {
                    sectionEntries.push(heroEntry);
                  }
                }
              }
            } catch (err) {
              console.error(
                `❌ Error processing ${type} (${blockId}):`,
                err.message,
              );
              summary.skipped.push({
                page: title,
                blockId,
                type,
                error: err.message,
              });
            }
          }
        }

        // Set all sections at once in the correct order (replaces existing)
        if (!effectiveDryRun && pageEntry) {
          if (sectionEntries.length > 0) {
            await setSectionsOnPage(env, pageEntry, sectionEntries);
          }

          if (navigationEntryLink || overwriteParentCtaLink) {
            // Re-fetch to get latest version before updating special field
            pageEntry = await env.getEntry(pageEntry.sys.id);
            if (navigationEntryLink) {
              console.log(`\n🔗 Setting sectionNavigation on page "${title}"`);
              pageEntry.fields.sectionNavigation = { [LOCALE]: navigationEntryLink };
            }
            if (overwriteParentCtaLink) {
              console.log(`\n🔗 Setting overwriteParentCta on page "${title}"`);
              pageEntry.fields.overwriteParentCta = { [LOCALE]: overwriteParentCtaLink };
            }
            pageEntry = await pageEntry.update();
            // Publish happens in publishPage step
          }
        }

        // 🚀 Final step: Publish the page now that it has valid sections
        if (!effectiveDryRun && pageEntry) {
          await publishPage(env, pageEntry, pageData);
        }
      }
    }

    if (source.isPeople) {
      await migratePeople(
        env,
        batchData,
        contentfulAssetMap,
        targetIndices,
        totalPages,
        summary,
      );
    }

    if (source.isQuotes) {
      await migrateQuotes(
        env,
        batchData,
        contentfulAssetMap,
        targetIndices,
        totalPages,
        summary,
      );
    }

    if (source.isResources) {
      await migrateResources(
        env,
        batchData,
        contentfulAssetMap,
        targetIndices,
        totalPages,
        summary,
        rawFileContent,
      );
    }

    if (source.isGlobalReachMap) {
      await migrateGlobalReachMap(
        env,
        batchData,
        summary
      );
    }

    if (source.isPodcasts) {
      await migratePodcasts(
        env,
        batchData,
        contentfulAssetMap,
        targetIndices,
        totalPages,
        summary,
      );
    }

    if (source.isStBtu) {
      await migrateStBtu(
        env,
        batchData,
        contentfulAssetMap,
        targetIndices,
        totalPages,
        summary,
        rawFileContent
      );
    }

    if (source.isSt) {
      await migrateSt(
        env,
        batchData,
        contentfulAssetMap,
        targetIndices,
        totalPages,
        summary,
        rawFileContent
      );
    }

    if (source.isForms) {
      await migrateForms(
        env,
        dataRaw,
        summary
      );
    }

    if (source.isPressMedia) {
      await migratePressMedia(
        env,
        batchData,
        contentfulAssetMap,
        targetIndices,
        totalPages,
        summary,
        rawFileContent
      );
    }
  }

  console.log("\n" + "=".repeat(40));
  console.log("📊 MIGRATION SUMMARY");
  console.log("=".repeat(40));

  if (summary.missingAssetMetadata.length > 0) {
    console.log("\n⚠️  MISSING ASSET METADATA (Add these to assets.json):");
    console.log(`   IDs: ${summary.missingAssetMetadata.join(", ")}`);
  }

  if (summary.missingResources.size > 0) {
    console.log("\n⚠️  MISSING RESOURCE ENTRIES (Skipped during migration):");
    console.log(`   IDs: ${Array.from(summary.missingResources).join(", ")}`);
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
    summary.skipped.forEach((s) =>
      console.log(`   - [${s.page}] ${s.type} (${s.blockId}): ${s.error}`),
    );
  }

  console.log("\n🚀 Migration Complete");
}

run().catch(console.error);
