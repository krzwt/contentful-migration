import fs from "fs";

const LOCALE = "en-US";
const S3_BASE_URL = "https://assets-uat.btdevops.io";

// Cache: asset title/filename → Contentful asset ID (avoid duplicates)
const uploadedAssetCache = new Map();

// Wistia embed data: craft asset ID → wistia hashed ID
const wistiaMap = new Map();

/**
 * Load Wistia embed data from wistia.json
 */
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
export function loadAssetMetadata(filePath) {
  const raw = fs.readFileSync(filePath, "utf-8");
  const json = JSON.parse(raw);
  const assets = json?.data?.assets || [];

  const assetMap = new Map();
  assets.forEach(asset => {
    // Replace S3_BASE_URL placeholder with actual URL
    let url = asset.url || "";
    if (url.startsWith("S3_BASE_URL")) {
      url = url.replace("S3_BASE_URL", S3_BASE_URL);
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
    } catch (e) {
      // ignore
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
              console.log(`   ⚠ Asset re-uploaded but still processing: ${metadata.title} (${existingId})`);
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

    // Create asset
    const asset = await env.createAsset({
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

    // Process the asset (catch timeout for JSON/large files)
    try {
      await asset.processForAllLocales();
    } catch {
      // Timeout is OK — we poll below
    }

    // Wait for processing to complete (polling)
    const processed = await waitForProcessing(env, asset.sys.id);
    if (!processed) {
      console.warn(`   ⚠ Asset "${metadata.title}" processing timed out. Left as draft.`);
      uploadedAssetCache.set(cacheKey, asset.sys.id);
      return asset.sys.id;
    }

    // Now publish
    try {
      await processed.publish();
      console.log(`   ✓ Uploaded & published: ${metadata.title} (${processed.sys.id})`);
    } catch (pubErr) {
      console.log(`   ⚠ Uploaded but publish failed: ${metadata.title} (${processed.sys.id})`);
    }

    uploadedAssetCache.set(cacheKey, processed.sys.id);
    return processed.sys.id;
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
