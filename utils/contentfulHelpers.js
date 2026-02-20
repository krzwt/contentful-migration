
const LOCALE = "en-US";

/**
 * Parse Craft CMS link JSON into { url, label }
 */
export function parseCraftLink(linkStr) {
    if (!linkStr) return { url: "", label: "" };
    try {
        const obj = typeof linkStr === "string" ? JSON.parse(linkStr) : linkStr;
        return {
            url: obj.linkedUrl || "",
            label: obj.linkedTitle || ""
        };
    } catch {
        return { url: String(linkStr), label: "" };
    }
}

/**
 * Upserts a 'cta' entry
 */
export async function upsertCta(env, id, label, url) {
    const fields = {
        label: { [LOCALE]: label || "" },
        url: { [LOCALE]: url || "" },
        target: { [LOCALE]: "_self (Same Tab)" }
    };

    return await upsertEntry(env, "cta", `cta-${id}`, fields);
}

/**
 * Wait for a Contentful asset to finish processing
 */
async function waitForAssetProcessing(env, assetId, maxAttempts = 5) {
    for (let i = 0; i < maxAttempts; i++) {
        try {
            const asset = await env.getAsset(assetId);
            const file = asset.fields?.file?.[LOCALE];
            if (file && file.url) {
                return true; // Asset is processed and has a URL
            }
        } catch (e) {
            // Asset might not exist yet
        }
        console.log(`   ⏳ Waiting for asset ${assetId} to process... (${i + 1}/${maxAttempts})`);
        await new Promise(resolve => setTimeout(resolve, 3000));
    }
    return false;
}

/**
 * Upserts an 'asset' wrapper entry
 */
export async function upsertAssetWrapper(env, id, contentfulAssetId, mimeType) {
    let type = "Image";
    if (mimeType?.includes("video")) type = "Video";
    if (mimeType?.includes("json") || mimeType?.includes("javascript")) type = "JSON";

    // Wait for the asset to finish processing before creating the wrapper
    const isReady = await waitForAssetProcessing(env, contentfulAssetId);
    if (!isReady) {
        console.warn(`   ⚠ Asset ${contentfulAssetId} not ready after waiting. Skipping wrapper.`);
        return null;
    }

    const fields = {
        assetType: { [LOCALE]: type },
        mediaAsset: {
            [LOCALE]: {
                sys: { type: "Link", linkType: "Asset", id: contentfulAssetId }
            }
        }
    };

    return await upsertEntry(env, "asset", `asset-${id}`, fields);
}

/**
 * Upserts a 'sectionTitle' entry
 */
export async function upsertSectionTitle(env, id, title) {
    const fields = {
        title: { [LOCALE]: title || "" },
        enableLinkedHeading: { [LOCALE]: false }
    };

    return await upsertEntry(env, "sectionTitle", `title-${id}`, fields);
}

/**
 * Core upsert logic for nested entries using a predictable ID.
 * Exported so handlers can create custom nested content types.
 */
export async function upsertEntry(env, contentType, entryId, fields) {
    try {
        let entry;
        try {
            entry = await env.getEntry(entryId);
            console.log(`   🔄 Updating nested ${contentType}: ${entryId}`);
            entry.fields = fields;
            entry = await entry.update();
        } catch (e) {
            console.log(`   ✨ Creating nested ${contentType}: ${entryId}`);
            entry = await env.createEntryWithId(contentType, entryId, { fields });
        }

        // Retry publish up to 3 times (asset links may need processing time)
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                entry = await env.getEntry(entry.sys.id); // re-fetch for latest version
                await entry.publish();
                return entry;
            } catch (pubErr) {
                if (attempt < 2 && pubErr.message?.includes('422')) {
                    console.log(`   ⏳ Publish retry ${attempt + 1}/3 for ${contentType}: ${entryId}`);
                    await new Promise(r => setTimeout(r, 3000));
                } else {
                    throw pubErr;
                }
            }
        }
        return entry;
    } catch (err) {
        console.error(`   🛑 Error upserting nested ${contentType} (${entryId}):`, err.message);
        return null;
    }
}

/**
 * Helper: create a Contentful Link reference object
 */
export function makeLink(id) {
    return { sys: { type: "Link", linkType: "Entry", id } };
}
