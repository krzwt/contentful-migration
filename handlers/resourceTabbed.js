/**
 * Handler: resourceTabbed → resourceTabSection
 * Craft: headingSection, tabbedResources (nested type-based tabs with entry IDs)
 * Contentful: resourceTabSection { blockId, blockName, sectionTitle, resourceTabs, blogTab, documentsTab, videosTab, ... }
 */
import { upsertEntry, upsertSectionTitle, makeLink, resolveEntryRef } from "../utils/contentfulHelpers.js";
import { getOrderedKeys } from "../utils/jsonOrder.js";
import fs from "fs";

const LOCALE = "en-US";
const CONTENT_TYPE = "resourceTabSection";

// Load ID map to distinguish between resource and webinar (created by utils/create_id_map.js)
let ID_MAP = {};
try {
    if (fs.existsSync('./data/resource_id_map.json')) {
        ID_MAP = JSON.parse(fs.readFileSync('./data/resource_id_map.json', 'utf-8'));
    }
} catch (e) {
    console.warn("   ⚠️ resource_id_map.json could not be loaded. Defaulting to resource-ID.");
}

// Map Craft tab types to Contentful field IDs
const TAB_FIELD_MAP = {
    documents: "documentsTab",
    videos: "videosTab",
    webinars: "webinarsTab",
    blog: "blogTab",
    blogs: "blogTab",
    podcast: "podcastsTab",
    podcasts: "podcastsTab",
    events: "eventsTab",
    media: "mediaTab"
};

// Contentful linkContentType per tab (only add links that match)
const TAB_ALLOWED_TYPES = {
    documentsTab: ["resourcesCpt", "newResearchCpt"],
    videosTab: ["resourcesCpt", "newVideoCpt"],
    blogTab: ["blogCpt", "resourcesCpt"],
    podcastsTab: ["podcastsCpt", "resourcesCpt"],
    eventsTab: ["eventsCpt", "resourcesCpt"],
    webinarsTab: ["resourcesCpt", "newEventsCpt"],
    mediaTab: ["resourcesCpt", "newPressMediaCpt"]
};

export async function createOrUpdateResourceTabbed(env, blockData, assetMap = null, summary = null) {
    try { await env.getContentType(CONTENT_TYPE); } catch (err) {
        console.warn(`   ⚠ Content type "${CONTENT_TYPE}" not found: ${err.message}. Skipping.`);
        return null;
    }

    const blockId = blockData.blockId;
    const heading = blockData.heading || blockData.headingSection || "";

    const titleEntry = await upsertSectionTitle(env, blockId, heading);

    const tabbedData = blockData.tabbedResources || {};
    const orderedTIds = getOrderedKeys(blockData.blockSegment, tabbedData);

    const fields = {
        blockId: { [LOCALE]: blockId },
        blockName: { [LOCALE]: blockData.blockName || heading || "Resource Tabs" }
    };

    if (titleEntry) fields.sectionTitle = { [LOCALE]: makeLink(titleEntry.sys.id) };

    // Initialize arrays for all possible tab fields
    const tabFields = [
        "blogTab", "documentsTab", "videosTab",
        "podcastsTab", "eventsTab", "webinarsTab", "mediaTab"
    ];
    tabFields.forEach(f => fields[f] = { [LOCALE]: [] });

    for (const tId of orderedTIds) {
        const tab = tabbedData[tId];
        if (typeof tab !== "object" || !tab.fields) continue;

        const type = tab.type;
        const entryIds = tab.fields?.entries || [];

        if (entryIds.length) {
            console.log(`   📋 Resource tab "${type}" references ${entryIds.length} entries: ${entryIds.join(", ")}`);

            const targetField = TAB_FIELD_MAP[type];
            if (!targetField) {
                console.warn(`   ⚠️ Unknown tab type "${type}". Skipping.`);
                continue;
            }

            const allowedTypes = TAB_ALLOWED_TYPES[targetField];
            for (const id of entryIds) {
                let contentfulId = ID_MAP[id];
                let contentType = null;
                const ref = resolveEntryRef(id);
                if (ref) {
                    contentfulId = contentfulId || ref.id;
                    contentType = ref.type;
                }
                if (!contentfulId) {
                    contentfulId = ID_MAP[id];
                }

                if (!contentfulId) {
                    console.warn(`   ⚠️ Skipping unmapped entry ID ${id} in tab "${type}"`);
                    if (summary) summary.missingResources.add(id);
                    continue;
                }

                // Resolve content type if we don't have it (e.g. from ID_MAP only)
                if (allowedTypes && !contentType && env) {
                    try {
                        const entry = await env.getEntry(contentfulId);
                        contentType = entry.sys?.contentType?.sys?.id || null;
                    } catch (_) {
                        contentType = null;
                    }
                }

                // Only add links that match the tab's linkContentType (avoid 422)
                if (allowedTypes && contentType && !allowedTypes.includes(contentType)) {
                    // videosTab: webinars are now resourcesCpt; try resource-{id}
                    if (targetField === "videosTab" && (contentType === "newWebinarsCpt" || String(contentfulId).startsWith("webinar-"))) {
                        const resourceId = `resource-${id}`;
                        try {
                            const resEntry = await env.getEntry(resourceId);
                            if (resEntry?.sys?.contentType?.sys?.id === "resourcesCpt") {
                                contentfulId = resourceId;
                                contentType = "resourcesCpt";
                            }
                        } catch (_) {
                            // resource entry doesn't exist, skip
                        }
                    }
                }

                if (allowedTypes && contentType && !allowedTypes.includes(contentType)) {
                    console.warn(`   ⚠️ Skipping entry ${contentfulId} (${contentType}) in "${targetField}" — allowed: ${allowedTypes.join(", ")}`);
                    if (summary) summary.missingResources.add(id);
                    continue;
                }

                if (!fields[targetField]) {
                    fields[targetField] = { [LOCALE]: [] };
                }

                fields[targetField][LOCALE].push(makeLink(contentfulId));
            }
        }
    }

    // Truncate to max items; keep empty arrays so we clear invalid links on update
    const maxLimit = 6;
    tabFields.forEach(f => {
        const items = fields[f][LOCALE];
        if (items.length > maxLimit) {
            console.warn(`   ⚠️ Field "${f}" has ${items.length} items, which exceeds Contentful's limit of ${maxLimit}. Truncating.`);
            fields[f][LOCALE] = items.slice(0, maxLimit);
        }
        // Keep field even when empty so existing invalid links (e.g. webinars in videosTab) get cleared
    });

    return await upsertEntry(env, CONTENT_TYPE, `restabs-${blockId}`, fields);
}

