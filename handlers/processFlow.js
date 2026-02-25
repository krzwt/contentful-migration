/**
 * Handler: processFlow → processFlowCards
 * Craft: headingSection, processFlow (nested blocks with heading, body, image)
 * Contentful: processFlowCards { blockId, blockName, sectionTitle, addItem: [iconGridItem] }
 */
import { upsertEntry, upsertSectionTitle, makeLink } from "../utils/contentfulHelpers.js";

const LOCALE = "en-US";
const CONTENT_TYPE = "processFlowCards";

export async function createOrUpdateProcessFlow(env, blockData, assetMap = null) {
    try { await env.getContentType(CONTENT_TYPE); } catch (err) {
        console.warn(`   ⚠ Content type "${CONTENT_TYPE}" not found: ${err.message}. Skipping.`);
        return null;
    }

    const blockId = blockData.blockId;
    const heading = blockData.headingSection || blockData.heading || "";

    const titleEntry = await upsertSectionTitle(env, blockId, heading);

    const itemRefs = [];
    const flowData = blockData.processFlow || {};

    for (const [fId, flow] of Object.entries(flowData)) {
        if (typeof flow !== "object" || !flow.fields) continue;
        const f = flow.fields;

        const itemTitle = await upsertSectionTitle(env, `pf-${fId}`, f.heading || "");

        const itemFields = {
            description: { [LOCALE]: f.body || "" }
        };
        if (itemTitle) itemFields.title = { [LOCALE]: makeLink(itemTitle.sys.id) };

        // Handle icon/image
        if (f.image?.length && assetMap) {
            const assetInfo = assetMap.get(String(f.image[0]));
            if (assetInfo) {
                itemFields.icon = { [LOCALE]: { sys: { type: "Link", linkType: "Asset", id: assetInfo.id } } };
            }
        }

        const itemEntry = await upsertEntry(env, "iconGridItem", `pfitem-${fId}`, itemFields);
        if (itemEntry) itemRefs.push(makeLink(itemEntry.sys.id));
    }

    const fields = {
        blockId: { [LOCALE]: blockId },
        blockName: { [LOCALE]: blockData.blockName || heading || "Process Flow" }
    };
    if (titleEntry) fields.sectionTitle = { [LOCALE]: makeLink(titleEntry.sys.id) };
    if (itemRefs.length) fields.addItem = { [LOCALE]: itemRefs };

    return await upsertEntry(env, CONTENT_TYPE, `processflow-${blockId}`, fields);
}
