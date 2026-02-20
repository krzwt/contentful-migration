/**
 * Handler: resourceTabbed → resourceTabSection
 * Craft: headingSection, tabbedResources (nested type-based tabs with entry IDs)
 * Contentful: resourceTabSection { blockId, blockName, sectionTitle, resourceTabs: [resourceTab] }
 *
 * Note: Craft references entries by ID. Since we don't have the resource data here,
 * we create placeholder resourceTab entries with the tab label.
 */
import { upsertEntry, upsertSectionTitle, makeLink } from "../utils/contentfulHelpers.js";

const LOCALE = "en-US";
const CONTENT_TYPE = "resourceTabSection";

// Map Craft tab types to labels
const TAB_LABELS = {
    documents: "Documents",
    videos: "Videos",
    webinars: "Webinars",
    caseStudies: "Case Studies",
    whitepapers: "Whitepapers",
    datasheets: "Datasheets",
    ebooks: "eBooks",
    infographics: "Infographics",
    blogs: "Blogs"
};

export async function createOrUpdateResourceTabbed(env, blockData, assetMap = null) {
    try { await env.getContentType(CONTENT_TYPE); } catch (err) {
        console.warn(`   ⚠ Content type "${CONTENT_TYPE}" not found: ${err.message}. Skipping.`);
        return null;
    }

    const blockId = blockData.blockId;
    const heading = blockData.headingSection || "";

    const titleEntry = await upsertSectionTitle(env, blockId, heading);

    const tabRefs = [];
    const tabbedData = blockData.tabbedResources || {};

    for (const [tId, tab] of Object.entries(tabbedData)) {
        if (typeof tab !== "object" || !tab.fields) continue;

        const tabLabel = TAB_LABELS[tab.type] || tab.type || `Tab ${tId}`;
        const entryIds = tab.fields?.entries || [];

        const tabFields = {
            tabLabel: { [LOCALE]: tabLabel }
        };

        // Note: Resource entries (entryIds) are external references.
        // They would need to be linked if those resources exist in Contentful.
        // For now, we log them.
        if (entryIds.length) {
            console.log(`   📋 Resource tab "${tabLabel}" references ${entryIds.length} entries: ${entryIds.join(", ")}`);
        }

        const tabEntry = await upsertEntry(env, "resourceTab", `rtab-${tId}`, tabFields);
        if (tabEntry) tabRefs.push(makeLink(tabEntry.sys.id));
    }

    const fields = {
        blockId: { [LOCALE]: blockId },
        blockName: { [LOCALE]: blockData.blockName || heading || "Resource Tabs" }
    };
    if (titleEntry) fields.sectionTitle = { [LOCALE]: makeLink(titleEntry.sys.id) };
    if (tabRefs.length) fields.resourceTabs = { [LOCALE]: tabRefs };

    return await upsertEntry(env, CONTENT_TYPE, `restabs-${blockId}`, fields);
}
