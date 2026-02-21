import fs from "fs";

const LOCALE = "en-US";
const S3_BASE_URL = process.env.S3_BASE_URL || "https://assets-uat.btdevops.io";

// Cache: asset title/filename → Contentful asset ID (avoid duplicates)
const uploadedAssetCache = new Map();

// Wistia embed data: craft asset ID → wistia hashed ID
const wistiaMap = new Map();

/**
 * Pre-populate the asset cache by fetching all existing assets from Contentful.
 * This avoids hundreds of individual "getAsset" calls.
 */
export async function prePopulateAssetCache(env) {
  console.log("🔍 Pre-populating asset cache from Contentful...");
  let total = 0;
  let skip = 0;
  const limit = 100;

  try {
    while (true) {
      const response = await env.getAssets({ skip, limit });
      if (response.items.length === 0) break;

      response.items.forEach(asset => {
        const title = asset.fields?.title?.[LOCALE];
        const file = asset.fields?.file?.[LOCALE];
        const filename = file?.fileName;
        const isPublished = !!asset.sys.publishedVersion;

        // ONLY cache if it's already published. 
        // If it's Draft, we want the upload logic to re-check it and try to fix it.
        if (isPublished) {
          if (title) uploadedAssetCache.set(title, asset.sys.id);
          if (filename) uploadedAssetCache.set(filename, asset.sys.id);
          total++;
        }
      });

      skip += limit;
      if (response.items.length < limit) break;
    }
    console.log(`✅ Cached ${total} existing assets from Contentful.\n`);
  } catch (err) {
    console.warn("⚠️  Could not pre-populate asset cache:", err.message);
  }
}
export function loadWistiaData(filePath = "./data/wistia.json") {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const json = JSON.parse(raw);
    const assets = json?.data?.assets || [];

    assets.forEach(asset => {
      if (asset.wistiaHashedId) {
        wistiaMap.set(String(asset.id), {
          title: asset.title,
          wistiaHashedId: asset.wistiaHashedId,
          filename: asset.filename
        });
      }
    });

    console.log(`🎬 Loaded ${wistiaMap.size} Wistia video entries`);
  } catch {
    console.log(`ℹ️  No wistia.json found — Wistia videos won't be migrated`);
  }
}

/**
 * Check if an asset is a Wistia video
 */
export function getWistiaData(craftAssetId) {
  return wistiaMap.get(String(craftAssetId)) || null;
}

/**
 * Load asset metadata from GraphQL JSON file
 */
export function loadAssetMetadata(filePaths) {
  const paths = Array.isArray(filePaths) ? filePaths : [filePaths];
  const assetMap = new Map();

  paths.forEach(filePath => {
    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      const json = JSON.parse(raw);
      const assets = json?.data?.assets || [];

      assets.forEach(asset => {
        let url = asset.url || "";

        // 1. Handle S3_BASE_URL placeholder
        if (url.startsWith("S3_BASE_URL")) {
          url = url.replace("S3_BASE_URL", S3_BASE_URL);
        }

        // 2. Automatically swap broken UAT domain with working domain
        const BROKEN_DOMAIN = "https://assets-uat.btdevops.io";
        if (url.startsWith(BROKEN_DOMAIN)) {
          url = url.replace(BROKEN_DOMAIN, S3_BASE_URL);
        }

        assetMap.set(String(asset.id), {
          title: asset.title,
          filename: asset.filename,
          url,
          mimeType: asset.mimeType,
          width: asset.width,
          height: asset.height
        });
      });
    } catch (err) {
      console.warn(`⚠️ Could not load asset metadata from ${filePath}: ${err.message}`);
    }
  });

  return assetMap;
}

/**
 * Wait for a Contentful asset to finish processing.
 * Returns true when the asset has a processed file URL.
 */
async function waitForProcessing(env, assetId, maxAttempts = 10) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const asset = await env.getAsset(assetId);
      const file = asset.fields?.file?.[LOCALE];

      if (file && file.url) {
        return asset; // processed — has a CDN url
      }

      if (file && file.error) {
        console.warn(`   ✗ Contentful fetch error: ${file.error.message || JSON.stringify(file.error)}`);
        // If it's a fetch error, it won't magically fix itself by waiting
        return null;
      }
    } catch (e) {
      // ignore getAsset errors
    }
    const delay = Math.min(2000 + i * 1000, 5000);
    console.log(`   ⏳ Waiting for processing... (${i + 1}/${maxAttempts})`);
    await new Promise(r => setTimeout(r, delay));
  }
  return null;
}

/**
 * Upload asset to Contentful from URL (with dedup by filename)
 */
export async function uploadAsset(env, assetId, metadata) {
  // Check in-memory cache first (same title already uploaded this run)
  const cacheKey = metadata.filename || metadata.title;
  if (uploadedAssetCache.has(cacheKey)) {
    const cachedId = uploadedAssetCache.get(cacheKey);
    console.log(`   ✓ Using cached asset: ${metadata.title} (${cachedId})`);
    return cachedId;
  }

  try {
    // Check if asset already exists in Contentful by title
    const existing = await env.getAssets({
      "fields.title": metadata.title,
      limit: 1
    });

    if (existing.items.length > 0) {
      const existingAsset = existing.items[0];
      const existingId = existingAsset.sys.id;

      // If it exists but is Draft, try to fix and publish it
      if (!existingAsset.sys.publishedVersion) {
        const file = existingAsset.fields?.file?.[LOCALE];
        if (file && file.url) {
          // Already processed — just publish
          try {
            await existingAsset.publish();
            console.log(`   ✓ Asset exists (published now): ${metadata.title} (${existingId})`);
          } catch {
            console.log(`   ✓ Asset exists (draft): ${metadata.title} (${existingId})`);
          }
        } else {
          // File not processed — re-upload with correct URL and process
          console.log(`   🔄 Re-uploading file for stuck asset: ${metadata.title}`);
          try {
            existingAsset.fields.file = {
              [LOCALE]: {
                contentType: metadata.mimeType,
                fileName: metadata.filename,
                upload: metadata.url
              }
            };
            const updated = await existingAsset.update();
            try {
              await updated.processForAllLocales();
            } catch {
              // Timeout is OK for JSON/large files — we'll poll below
            }
            // Poll for processing completion
            const processed = await waitForProcessing(env, existingId);
            if (processed) {
              try {
                await processed.publish();
                console.log(`   ✓ Asset fixed & published: ${metadata.title} (${existingId})`);
              } catch {
                console.log(`   ✓ Asset fixed (draft): ${metadata.title} (${existingId})`);
              }
            } else {
              console.warn(`   ⚠ Asset fixed but still processing/failed: ${metadata.title} (${existingId})`);
            }
          } catch (fixErr) {
            console.warn(`   ⚠ Could not fix asset: ${metadata.title}: ${fixErr.message?.substring(0, 100)}`);
          }
        }
      } else {
        console.log(`   ✓ Asset exists: ${metadata.title} (${existingId})`);
      }

      uploadedAssetCache.set(cacheKey, existingId);
      return existingId;
    }

    // Validate URL before uploading
    if (!metadata.url || !metadata.url.startsWith("http")) {
      console.error(`   ✗ Invalid URL for "${metadata.title}": ${metadata.url}`);
      return null;
    }

    // Create asset with a predictable ID
    const contentfulId = `asset-${assetId}`;
    let asset;
    try {
      asset = await env.createAssetWithId(contentfulId, {
        fields: {
          title: { [LOCALE]: metadata.title },
          description: { [LOCALE]: `Migrated from Craft CMS (ID: ${assetId})` },
          file: {
            [LOCALE]: {
              contentType: metadata.mimeType,
              fileName: metadata.filename,
              upload: metadata.url
            }
          }
        }
      });
    } catch (createErr) {
      // If ID already exists but wasn't found by title (rare), just get it
      if (createErr.status === 409 || createErr.name === "VersionMismatch") {
        asset = await env.getAsset(contentfulId);
      } else {
        throw createErr;
      }
    }

    // Process the asset (catch timeout for JSON/large files)
    try {
      await asset.processForAllLocales();
    } catch {
      // Timeout is OK — we poll below
    }

    // Wait for processing to complete (polling)
    const processed = await waitForProcessing(env, asset.sys.id);

    if (processed) {
      try {
        await processed.publish();
        console.log(`   ✓ Uploaded & published: ${metadata.title} (${processed.sys.id})`);
      } catch (pubErr) {
        console.log(`   ⚠ Uploaded but publish failed: ${metadata.title} (${processed.sys.id})`);
      }
    } else {
      console.warn(`   ⚠ Asset "${metadata.title}" processing failed or timed out. Link: ${metadata.url}`);
    }

    const finalId = processed ? processed.sys.id : asset.sys.id;
    uploadedAssetCache.set(cacheKey, finalId);
    return finalId;
  } catch (err) {
    // Handle 409 conflict (already exists)
    if (err.name === "VersionMismatch" || err.status === 409) {
      try {
        const existing = await env.getAssets({
          "fields.title": metadata.title,
          limit: 1
        });
        if (existing.items.length > 0) {
          const existingId = existing.items[0].sys.id;
          console.log(`   ✓ Recovered: Using existing asset for "${metadata.title}" (${existingId})`);
          uploadedAssetCache.set(cacheKey, existingId);
          return existingId;
        }
      } catch (recoveryErr) {
        console.error(`   ✗ Recovery failed for ${metadata.title}:`, recoveryErr.message);
      }
    }

    console.error(`   ✗ Failed to upload ${metadata.title}:`, err.message || err);
    return null;
  }
}

/**
 * Fast lookup: find existing asset in Contentful by title (no upload, no wait)
 * Used during page migration when assets are already uploaded.
 */
export async function lookupAsset(env, assetId, metadata) {
  const cacheKey = metadata.filename || metadata.title;
  if (uploadedAssetCache.has(cacheKey)) {
    return uploadedAssetCache.get(cacheKey);
  }

  try {
    const existing = await env.getAssets({
      "fields.title": metadata.title,
      limit: 1
    });

    if (existing.items.length > 0) {
      const existingId = existing.items[0].sys.id;
      uploadedAssetCache.set(cacheKey, existingId);
      return existingId;
    }
  } catch (e) {
    // ignore lookup errors
  }

  console.warn(`   ⚠ Asset not found in Contentful: "${metadata.title}" (run npm run assets first)`);
  return null;
}

/**
 * Process all assets for migration
 * @param {boolean} lookupOnly - If true, only look up existing assets (no upload/wait)
 */
export async function processAssets(env, assetIds, assetMetadata, isDryRun = false, lookupOnly = false) {
  const contentfulAssetMap = new Map();
  const missingIds = [];

  for (const craftAssetId of assetIds) {
    // 1. Check if it's a Wistia video (fastest path)
    const wistia = getWistiaData(craftAssetId);
    if (wistia) {
      contentfulAssetMap.set(String(craftAssetId), {
        id: null, // No Contentful Asset ID for Wistia embeds
        mimeType: "video/wistia",
        wistiaUrl: `https://fast.wistia.com/embed/medias/${wistia.wistiaHashedId}`
      });
      continue;
    }

    const metadata = assetMetadata.get(String(craftAssetId));

    if (!metadata) {
      console.warn(`   ⚠ No metadata for asset ID: ${craftAssetId}`);
      missingIds.push(craftAssetId);
      continue;
    }

    if (isDryRun) {
      console.log(`   [DRY RUN] Would upload: ${metadata.title} (${metadata.url})`);
      contentfulAssetMap.set(String(craftAssetId), {
        id: "dry-run-asset-id",
        mimeType: metadata.mimeType
      });
    } else if (lookupOnly) {
      // Fast path: just find existing asset, no upload/processing
      const contentfulId = await lookupAsset(env, craftAssetId, metadata);
      if (contentfulId) {
        contentfulAssetMap.set(String(craftAssetId), {
          id: contentfulId,
          mimeType: metadata.mimeType
        });
      }
    } else {
      const contentfulId = await uploadAsset(env, craftAssetId, metadata);
      if (contentfulId) {
        contentfulAssetMap.set(String(craftAssetId), {
          id: contentfulId,
          mimeType: metadata.mimeType
        });
      }
    }
  }

  return { assetMap: contentfulAssetMap, missingIds };
}
