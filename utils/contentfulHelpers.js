import fs from "fs";
import { cleanCraftUrls, normalizeUrl } from "./normalize.js";

const LOCALE = "en-US";
const GLOBAL_URL_MAP = new Map(); // Map craftId -> uri/slug
const GLOBAL_ENTRY_ID_TO_SYS_ID = new Map(); // Map craftId -> Contentful Sys ID

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
        "./data/newPartners.json",
        "./data/people-cpt.json",
        "./data/company-quotes.json",
        "./data/resources-cpt.json",
        "./data/videos-cpt.json",
        "./data/resource-webinars-cpt.json",
        "./data/podcasts-cpt.json",
        "./data/newPodcasts.json",
        "./data/events.json",
        "./data/media-cpt.json",
        "./data/new-S&T.json",
        "./data/new-S&T-BTU.json",
        "./data/users.json",
        "./data/page.json"
    ];

    sources.forEach(file => {
        if (!fs.existsSync(file)) return;
        try {
            const content = fs.readFileSync(file, "utf-8");

            // 1. Initial pass: Index items that are top-level objects in the JSON
            const data = JSON.parse(content);
            if (Array.isArray(data)) {
                data.forEach(item => {
                    if (item.id) {
                        const url = item.uri || item.slug || "";
                        GLOBAL_URL_MAP.set(String(item.id), { url, title: item.title || "" });
                    }
                });
            }

            // 2. Secondary pass: Deep-crawl the raw content for {entry:ID@...||URL} patterns.
            // This captures URIs for internal links to pages/products not yet migrated as top-level entries.
            const regex = /\{entry:(\d+)(?:@.*?)?\|\|(.*?)\}/g;
            let match;
            while ((match = regex.exec(content)) !== null) {
                const id = String(match[1]);
                const url = match[2];
                // Don't overwrite if we already have a URI
                if (!GLOBAL_URL_MAP.has(id)) {
                    GLOBAL_URL_MAP.set(id, { url, title: "" });
                }
            }

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
 * Pre-populates a map of Craft entryId -> Contentful Sys ID
 * to avoid making redundant queries during migration.
 */
export async function prePopulateEntryIdCache(env) {
    if (!env) return;
    console.log("🔍 Pre-populating entryId sys.id cache from Contentful...");

    const contentTypes = [
        "users",
        "blogCpt",
        "resourcesCpt",
        "resourceWebinarsCpt",
        "announcementBanner",
        "newStBtu",
        "newPressMediaCpt",
        "podcastsCpt",
        "newStTam",
        "newStServices",
        "embedFormsCpt",
        "newSt",
        "newGlobalReachMap",
        "eventsCpt",
        "newEventsCpt",
        "newStandaloneContent",
        "newStandaloneConversion",
        "newStandaloneMicrosite",
        "newStandaloneThankYou",
        "peopleCpt",
        "newCompany",
        "newPartners",
        "company",
        "newPartnersEmbeds",
        "newEmbedsCpt",
        "quoteItem"
    ];

    let totalCached = 0;
    for (const contentType of contentTypes) {
        try {
            let skip = 0;
            let countForType = 0;
            while (true) {
                const response = await env.getEntries({
                    content_type: contentType,
                    select: "sys.id,fields.entryId",
                    limit: 1000,
                    skip: skip
                });

                if (response.items.length === 0) break;

                response.items.forEach(item => {
                    const craftId = item.fields?.entryId?.[LOCALE];
                    if (craftId) {
                        GLOBAL_ENTRY_ID_TO_SYS_ID.set(String(craftId), {
                            id: item.sys.id,
                            type: contentType
                        });
                        countForType++;
                        totalCached++;
                    }
                });

                skip += response.items.length;
                if (response.items.length < 1000) break;
            }
            if (countForType > 0) {
                console.log(`   ✅ Cached ${countForType} ${contentType} entries.`);
            }
        } catch (e) {
            // Usually means content type not found or query error
            console.warn(`   ⚠️ Skipping ${contentType}: ${e.message}`);
        }
    }

    console.log(`   🚀 Total cache: ${totalCached} entryId mappings.\n`);
}


/**
 * Registers a new entry in the local cache
 */
export function registerEntryId(craftId, sysId, contentType) {
    if (craftId && sysId && contentType) {
        GLOBAL_ENTRY_ID_TO_SYS_ID.set(String(craftId), {
            id: sysId,
            type: contentType
        });
    }
}

/**
 * Resolves a Craft ID to a Contentful Sys ID and Type
 */
export function resolveEntryRef(craftId) {
    if (!craftId) return null;
    return GLOBAL_ENTRY_ID_TO_SYS_ID.get(String(craftId)) || null;
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
        const linkedId = obj.linkedId || null;
        let label = obj.linkedTitle || "";

        // Handle inner payload for custom text labels
        if (obj.payload) {
            try {
                const payload = typeof obj.payload === "string" ? JSON.parse(obj.payload) : obj.payload;
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
            linkedId: linkedId
        };
    } catch {
        return { url: String(linkStr), label: "", linkedId: null };
    }
}

/**
 * Upserts a 'cta' entry
 */
export async function upsertCta(env, id, label, url, shouldPublish = true, linkedId = null) {
    let safeUrl = cleanCraftUrls(url || "");

    // Normalize: strip staging/production domain prefixes → relative path
    safeUrl = normalizeUrl(safeUrl);

    if (safeUrl.length > 255) {
        console.warn(`   ⚠️ URL for cta-${id} exceeds 255 chars. Truncating...`);
        safeUrl = safeUrl.substring(0, 255);
    }

    let finalLabel = label || "";
    const fields = {
        label: { [LOCALE]: finalLabel },
        url: { [LOCALE]: safeUrl },
        target: { [LOCALE]: safeUrl.startsWith("http") ? "_blank (New Tab)" : "_self (Same Tab)" }
    };

    // If we have a linkedId, try to find the actual page entry in Contentful using the cache
    if (linkedId && env) {
        const ref = resolveEntryRef(linkedId);

        if (ref) {
            console.log(`   🔗 Linked CTA ${id} to page entry: ${ref.id} (type: ${ref.type})`);
            fields.pageLink = { [LOCALE]: { sys: { type: "Link", linkType: "Entry", id: ref.id } } };
            fields.url = { [LOCALE]: "" }; // Clear URL when internal reference is resolved
        } else {
            // Fallback: If page entry not found in Contentful, use resolved internal URL from slugs
            const internalUrl = resolveInternalUrl(linkedId);
            if (internalUrl) {
                let normalizedUrl = normalizeUrl(internalUrl);
                console.log(`   🌐 Page ${linkedId} not in Contentful. Using URL: ${normalizedUrl}`);
                fields.url = { [LOCALE]: normalizedUrl };
                fields.target = { [LOCALE]: normalizedUrl.startsWith("http") ? "_blank (New Tab)" : "_self (Same Tab)" };
            }
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
    let justCreated = false;
    try {
        try {
            entry = await env.getEntry(entryId);
        } catch (e) {
            if (e.name === 'NotFound' || e.status === 404) {
                console.log(`   ✨ Creating nested ${contentType}: ${entryId}`);
                const payload = { fields };
                if (metadata) payload.metadata = metadata;
                entry = await env.createEntryWithId(contentType, entryId, payload);
                justCreated = true;
            } else {
                throw e;
            }
        }

        if (entry && !justCreated) {
            console.log(`   🔄 Updating nested ${contentType}: ${entryId}`);
            // Merge fields individually
            for (const [key, val] of Object.entries(fields)) {
                entry.fields[key] = val;
            }
            if (metadata) {
                entry.metadata = { ...entry.metadata, ...metadata };
            }
            entry = await entry.update();
        }

        // Register in cache
        registerEntryId(fields.entryId?.[LOCALE], entry.sys.id, contentType);

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
                    if (pubErr.details && pubErr.details.errors) {
                        console.error(`   🛑 Validation Error for ${contentType} (${entryId}):`, JSON.stringify(pubErr.details.errors, null, 2));
                    } else if (pubErr.details) {
                        console.warn(`   ⚠ Validation Error details for ${contentType} (${entryId}):`, JSON.stringify(pubErr.details, null, 2));
                    }
                    console.warn(`   ⚠ Could not publish ${contentType} (${entryId}): ${pubErr.message}`);
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
export function makeLink(id, linkType = "Entry") {
    return { sys: { type: "Link", linkType: linkType, id } };
}

