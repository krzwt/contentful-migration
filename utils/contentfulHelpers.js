import fs from "fs";

const LOCALE = "en-US";
const GLOBAL_URL_MAP = new Map(); // Map craftId -> uri/slug

/**
 * Builds a global map of all Entry IDs and their final URLs/Slugs
 * to help resolve internal links.
 */
export function buildUrlMap() {
    console.log("🔍 Indexing all entries to resolve internal links...");
    const sources = [
        "./data/standalone-content.json",
        "./data/standalone-conversion.json",
        "./data/standalone-microsite.json",
        "./data/standalone-thankyou.json",
        "./data/people-cpt.json",
        "./data/company-quotes.json",
        "./data/resources-cpt.json",
        "./data/videos-cpt.json",
        "./data/resource-webinars-cpt.json",
        "./data/podcasts-cpt.json",
        "./data/events-cpt.json",
        "./data/media-cpt.json",
        "./data/page.json"
    ];

    sources.forEach(file => {
        if (!fs.existsSync(file)) return;
        try {
            const data = JSON.parse(fs.readFileSync(file, "utf-8"));
            data.forEach(item => {
                if (item.id) {
                    const url = item.uri || item.slug || "";
                    GLOBAL_URL_MAP.set(String(item.id), { url, title: item.title || "" });
                }
            });
        } catch (e) {
            console.warn(`   ⚠️ Could not index ${file}: ${e.message}`);
        }
    });

    // Load manual overrides
    const manualFile = "./data/manual-links.json";
    if (fs.existsSync(manualFile)) {
        try {
            const manualData = JSON.parse(fs.readFileSync(manualFile, "utf-8"));
            for (const [id, info] of Object.entries(manualData)) {
                GLOBAL_URL_MAP.set(String(id), info);
            }
            console.log(`   📝 Loaded ${Object.keys(manualData).length} manual link overrides.`);
        } catch (e) {
            console.warn(`   ⚠️ Could not load manual links: ${e.message}`);
        }
    }
    console.log(`   ✅ Indexed ${GLOBAL_URL_MAP.size} total entry references.\n`);
}

/**
 * Resolves a Craft ID to a relative URL (slug/uri)
 */
export function resolveInternalUrl(id) {
    if (!id) return null;
    const info = GLOBAL_URL_MAP.get(String(id));
    return info ? info.url : null;
}

/**
 * Resolves a Craft ID to a Title
 */
export function resolveInternalTitle(id) {
    if (!id) return null;
    const info = GLOBAL_URL_MAP.get(String(id));
    return info ? info.title : null;
}

/**
 * Parse Craft CMS link JSON into { url, label }
 */
export function parseCraftLink(linkStr) {
    if (!linkStr) return { url: "", label: "", linkedId: null };
    try {
        const obj = typeof linkStr === "string" ? JSON.parse(linkStr) : linkStr;
        let label = obj.linkedTitle || "";

        // Handle inner payload for custom text labels
        if (obj.payload) {
            try {
                const payload = typeof obj.payload === 'string' ? JSON.parse(obj.payload) : obj.payload;
                if (payload && payload.customText) {
                    label = payload.customText;
                }
            } catch (e) {
                // Ignore payload parsing errors
            }
        }

        return {
            url: obj.linkedUrl || "",
            label: label,
            linkedId: obj.linkedId || null
        };
    } catch {
        return { url: String(linkStr), label: "", linkedId: null };
    }
}

/**
 * Upserts a 'cta' entry
 */
export async function upsertCta(env, id, label, url, shouldPublish = true, linkedId = null) {
    let safeUrl = url || "";
    if (safeUrl.length > 255) {
        console.warn(`   ⚠️ URL for cta-${id} exceeds 255 chars. Truncating...`);
        safeUrl = safeUrl.substring(0, 255);
    }

    const fields = {
        label: { [LOCALE]: label || "" },
        url: { [LOCALE]: safeUrl },
        target: { [LOCALE]: safeUrl.startsWith("http") ? "_blank (New Tab)" : "_self (Same Tab)" }
    };

    // If we have a linkedId, try to find the actual page entry in Contentful to create a Reference link
    if (linkedId && env) {
        try {
            // Search across the main page content types
            const pageTypes = [
                "newStandaloneContent",
                "newStandaloneMicrosite",
                "newStandaloneThankYou",
                "newStandaloneConversion",
                "peopleCpt",
                "resourceWebinarsCpt",
                "resourcesCpt",
                "page"
            ];

            const queries = pageTypes.map(cpt =>
                env.getEntries({
                    content_type: cpt,
                    "fields.entryId": String(linkedId),
                    limit: 1
                }).catch(() => ({ items: [] }))
            );

            const results = await Promise.all(queries);
            let pageEntry = null;
            for (const res of results) {
                if (res.items && res.items.length > 0) {
                    pageEntry = res.items[0];
                    break;
                }
            }

            if (pageEntry) {
                console.log(`   🔗 Linked CTA ${id} to page entry: ${pageEntry.sys.id} (entryId: ${linkedId})`);
                fields.pageLink = { [LOCALE]: makeLink(pageEntry.sys.id) };
            } else {
                console.log(`   ℹ️ Could not find page entry with entryId: ${linkedId} for CTA ${id}. Using URL fallback.`);
            }
        } catch (err) {
            console.warn(`   ⚠️ Error resolving linkedId ${linkedId} for CTA ${id}: ${err.message}`);
        }
    }

    return await upsertEntry(env, "cta", `cta-${id}`, fields, shouldPublish);
}

/**
 * Ensure a Contentful asset is published before linking it.
 * If it's Draft, try to publish it. Returns true if published.
 */
export async function ensureAssetPublished(env, assetId) {
    if (!assetId) return false;
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
 * @param {string} videoUrl - Optional Wistia/External video URL
 */
export async function upsertAssetWrapper(env, id, contentfulAssetId, mimeType, videoUrl = null) {
    let type = "Image";
    if (mimeType?.includes("video") || videoUrl) type = "Video";
    if (mimeType?.includes("json") || mimeType?.includes("javascript")) type = "JSON";

    // If it's a Wistia/External video, we use the videoUrl field
    if (videoUrl) {
        console.log(`   🎬 Creating video asset wrapper (Wistia): asset-${id}`);
        const fields = {
            assetType: { [LOCALE]: "Video" },
            videoUrl: { [LOCALE]: videoUrl }
        };
        return await upsertEntry(env, "asset", `asset-${id}`, fields);
    }

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
        enableLinkedHeading: { [LOCALE]: true }
    };

    return await upsertEntry(env, "sectionTitle", `title-${id}`, fields);
}

/**
 * Core upsert logic for nested entries using a predictable ID.
 * Exported so handlers can create custom nested content types.
 */
export async function upsertEntry(env, contentType, entryId, fields, shouldPublish = true, metadata = null) {
    if (!env) {
        console.log(`   [DRY RUN] Would upsert ${contentType}: ${entryId} (Publish: ${shouldPublish})`);
        return { sys: { id: entryId } };
    }
    let entry;
    try {
        try {
            entry = await env.getEntry(entryId);
        } catch (e) {
            if (e.name === 'NotFound' || e.status === 404) {
                console.log(`   ✨ Creating nested ${contentType}: ${entryId}`);
                const payload = { fields };
                if (metadata) payload.metadata = metadata;
                entry = await env.createEntryWithId(contentType, entryId, payload);
            } else {
                throw e;
            }
        }

        if (entry && !entry.sys.createdAt) { // Just created? No, createEntryWithId returns the entry.
            // If we didn't just create it, we update it.
        } else if (entry) {
            console.log(`   🔄 Updating nested ${contentType}: ${entryId}`);
            entry.fields = fields;
            if (metadata) {
                entry.metadata = { ...entry.metadata, ...metadata };
            }
            entry = await entry.update();
        }

        if (!shouldPublish) {
            console.log(`   📝 Entry ${entryId} saved as draft.`);
            return entry;
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
                    console.warn(`   ⚠ Could not publish ${contentType} (${entryId}): ${pubErr.message?.substring(0, 100)}`);
                    return entry; // Return the draft entry so it can still be linked
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
