import fs from "fs";
import fetch from "node-fetch";

const LOCALE = "en-US";
const S3_BASE_URL = "https://assets-uat.btdevops.io";

// Cache: asset title/filename → Contentful asset ID (avoid duplicates)
const uploadedAssetCache = new Map();

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
      const existingId = existing.items[0].sys.id;
      console.log(`   ✓ Asset exists: ${metadata.title} (${existingId})`);
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

    // Process and publish
    try {
      await asset.processForAllLocales();
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for processing
      const published = await asset.publish();
      console.log(`   ✓ Uploaded and published: ${metadata.title}`);
      uploadedAssetCache.set(cacheKey, published.sys.id);
      return published.sys.id;
    } catch (publishErr) {
      const errInfo = typeof publishErr.message === 'string' && publishErr.message.startsWith('{')
        ? JSON.parse(publishErr.message)
        : publishErr;

      if (publishErr.name === "VersionMismatch" || errInfo.status === 409) {
        console.log(`   ⚠ Asset "${metadata.title}" version mismatch during publish. Using asset ID.`);
        uploadedAssetCache.set(cacheKey, asset.sys.id);
        return asset.sys.id;
      }
      throw publishErr;
    }
  } catch (err) {
    const errInfo = typeof err.message === 'string' && err.message.startsWith('{')
      ? JSON.parse(err.message)
      : err;

    if (err.name === "VersionMismatch" || errInfo.status === 409 || err.status === 409) {
      try {
        const existing = await env.getAssets({
          "fields.title": metadata.title,
          limit: 1
        });
        if (existing.items.length > 0) {
          const existingId = existing.items[0].sys.id;
          console.log(`   ✓ Recovered: Using existing asset for "${metadata.title}"`);
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
 * Process all assets for migration
 */
export async function processAssets(env, assetIds, assetMetadata, isDryRun = false) {
  const contentfulAssetMap = new Map();
  const missingIds = [];

  for (const craftAssetId of assetIds) {
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
