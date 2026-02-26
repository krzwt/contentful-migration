/**
 * Handler: resourceTabbed → resourceTabSection
 * Craft: headingSection, tabbedResources (nested type-based tabs with entry IDs)
 * Contentful: resourceTabSection { blockId, blockName, sectionTitle, resourceTabs, blogTab, documentsTab, videosTab, ... }
 */
import { upsertEntry, upsertSectionTitle, makeLink } from "../utils/contentfulHelpers.js";
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

export async function createOrUpdateResourceTabbed(env, blockData, assetMap = null, summary = null) {
    try { await env.getContentType(CONTENT_TYPE); } catch (err) {
        console.warn(`   ⚠ Content type "${CONTENT_TYPE}" not found: ${err.message}. Skipping.`);
        return null;
    }

    const blockId = blockData.blockId;
    const heading = blockData.headingSection || "";

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

            for (const id of entryIds) {
                const contentfulId = ID_MAP[id];
                if (!contentfulId) {
                    console.warn(`   ⚠️ Skipping unmapped entry ID ${id} in tab "${type}"`);
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

    // Clean up empty fields and handle "max items" based on Contentful schema validation
    tabFields.forEach(f => {
        const items = fields[f][LOCALE];
        if (items.length === 0) {
            delete fields[f];
        } else {
            const maxLimit = (f === "blogTab") ? 5 : 6;
            if (items.length > maxLimit) {
                console.warn(`   ⚠️ Field "${f}" has ${items.length} items, which exceeds Contentful's limit of ${maxLimit}. Truncating.`);
                fields[f][LOCALE] = items.slice(0, maxLimit);
            }
        }
    });

    return await upsertEntry(env, CONTENT_TYPE, `restabs-${blockId}`, fields);
}

