import fs from "fs";
import fetch from "node-fetch";

const LOCALE = "en-US";

/**
 * Load asset metadata from GraphQL JSON file
 */
export function loadAssetMetadata(filePath) {
  const raw = fs.readFileSync(filePath, "utf-8");
  const json = JSON.parse(raw);
  const assets = json?.data?.assets || [];

  const assetMap = new Map();
  assets.forEach(asset => {
    assetMap.set(String(asset.id), {
      title: asset.title,
      filename: asset.filename,
      url: asset.url,
      mimeType: asset.mimeType,
      width: asset.width,
      height: asset.height
    });
  });

  return assetMap;
}

/**
 * Upload asset to Contentful from URL
 */
export async function uploadAsset(env, assetId, metadata) {
  try {
    // Check if asset already exists (idempotent)
    const existing = await env.getAssets({
      "fields.title": metadata.title,
      limit: 1
    });

    if (existing.items.length > 0) {
      console.log(`   ✓ Asset exists: ${metadata.title}`);
      return existing.items[0].sys.id;
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
    await asset.processForAllLocales();
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for processing
    const published = await asset.publish();

    console.log(`   ✓ Uploaded: ${metadata.title}`);
    return published.sys.id;
  } catch (err) {
    console.error(`   ✗ Failed to upload ${metadata.title}:`, JSON.stringify(err, null, 2));

    // If asset is already published or there is a version conflict (409),
    // treat it as success and just re-use the existing asset by title.
    if (err.status === 409) {
      try {
        const existing = await env.getAssets({
          "fields.title": metadata.title,
          limit: 1
        });
        if (existing.items.length > 0) {
          console.log(`   ✓ Using already-published asset for ${metadata.title}`);
          return existing.items[0].sys.id;
        }
      } catch {
        // fall through to null return below
      }
    }

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
