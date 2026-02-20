
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
 * Ensure a Contentful asset is published before linking it.
 * If it's Draft, try to publish it. Returns true if published.
 */
async function ensureAssetPublished(env, assetId) {
    try {
        const asset = await env.getAsset(assetId);
        const file = asset.fields?.file?.[LOCALE];

        if (!file || !file.url) {
            // Asset not processed yet — try to process it
            console.log(`   ⏳ Asset ${assetId} not processed, triggering process...`);
            try {
                await asset.processForAllLocales();
                await new Promise(r => setTimeout(r, 3000));
            } catch {
                // might already be processing
            }
            // Re-check
            const refreshed = await env.getAsset(assetId);
            const refreshedFile = refreshed.fields?.file?.[LOCALE];
            if (!refreshedFile || !refreshedFile.url) {
                console.warn(`   ⚠ Asset ${assetId} still not processed after retry.`);
                return false;
            }
        }

        // Check if already published
        const latest = await env.getAsset(assetId);
        if (!latest.sys.publishedVersion || latest.sys.version > latest.sys.publishedVersion + 1) {
            // Needs publishing
            try {
                await latest.publish();
                console.log(`   ✓ Published Draft asset: ${assetId}`);
            } catch (pubErr) {
                console.warn(`   ⚠ Could not publish asset ${assetId}: ${pubErr.message?.substring(0, 100)}`);
                return false;
            }
        }
        return true;
    } catch (e) {
        console.warn(`   ⚠ Asset ${assetId} not found in Contentful.`);
        return false;
    }
}

/**
 * Upserts an 'asset' wrapper entry
 */
export async function upsertAssetWrapper(env, id, contentfulAssetId, mimeType) {
    let type = "Image";
    if (mimeType?.includes("video")) type = "Video";
    if (mimeType?.includes("json") || mimeType?.includes("javascript")) type = "JSON";

    // Ensure the linked asset is published first
    const isReady = await ensureAssetPublished(env, contentfulAssetId);
    if (!isReady) {
        console.warn(`   ⚠ Asset ${contentfulAssetId} not ready. Saving wrapper as draft.`);
        // Create/update wrapper but DON'T publish — save as draft
        try {
            const fields = {
                assetType: { [LOCALE]: type },
                mediaAsset: {
                    [LOCALE]: {
                        sys: { type: "Link", linkType: "Asset", id: contentfulAssetId }
                    }
                }
            };
            let entry;
            try {
                entry = await env.getEntry(`asset-${id}`);
                entry.fields = fields;
                entry = await entry.update();
            } catch {
                entry = await env.createEntryWithId("asset", `asset-${id}`, { fields });
            }
            console.log(`   📝 Asset wrapper saved as draft: asset-${id}`);
            return entry; // Return unpublished entry so it still links to page
        } catch (err) {
            console.error(`   🛑 Could not create draft wrapper: ${err.message}`);
            return null;
        }
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
