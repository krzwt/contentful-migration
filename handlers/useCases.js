/**
 * Handler: useCases → useCases
 * Craft: heading45, useCases (nested blocks with heading, body, image, ctaLink)
 * Contentful: useCases { blockId, blockName, sectionTitle, addItem: [iconGridItem] }
 */
import { upsertEntry, upsertSectionTitle, upsertCta, makeLink, parseCraftLink } from "../utils/contentfulHelpers.js";

const LOCALE = "en-US";
const CONTENT_TYPE = "useCases";

export async function createOrUpdateUseCases(env, blockData, assetMap = null) {
    try { await env.getContentType(CONTENT_TYPE); } catch (err) {
        console.warn(`   ⚠ Content type "${CONTENT_TYPE}" not found: ${err.message}. Skipping.`);
        return null;
    }

    const blockId = blockData.blockId;
    const heading = blockData.heading45 || blockData.headingSection || "";

    // Create sectionTitle
    const titleEntry = await upsertSectionTitle(env, blockId, heading);

    // Create iconGridItem entries for each use case
    const itemRefs = [];
    const useCasesData = blockData.useCases || {};

    for (const [ucId, uc] of Object.entries(useCasesData)) {
        if (typeof uc !== "object" || !uc.fields) continue;
        const f = uc.fields;

        // Create sectionTitle for the item
        const itemTitle = await upsertSectionTitle(env, `uc-${ucId}`, f.heading || "");

        // Create CTA if link exists
        let ctaEntry = null;
        const link = parseCraftLink(f.ctaLink);
        if (link.url || f.ctaLabel) {
            ctaEntry = await upsertCta(env, `uc-${ucId}`, f.ctaLabel || link.label || "", link.url);
        }

        const itemFields = {
            description: { [LOCALE]: f.body || "" }
        };
        if (itemTitle) itemFields.title = { [LOCALE]: makeLink(itemTitle.sys.id) };
        if (ctaEntry) itemFields.cta = { [LOCALE]: makeLink(ctaEntry.sys.id) };

        // Handle icon/image
        if (f.image?.length && assetMap) {
            const assetInfo = assetMap.get(String(f.image[0]));
            if (assetInfo) {
                itemFields.icon = { [LOCALE]: { sys: { type: "Link", linkType: "Asset", id: assetInfo.id } } };
            }
        }

        const itemEntry = await upsertEntry(env, "iconGridItem", `ucitem-${ucId}`, itemFields);
        if (itemEntry) itemRefs.push(makeLink(itemEntry.sys.id));
    }

    const fields = {
        blockId: { [LOCALE]: blockId },
        blockName: { [LOCALE]: blockData.blockName || heading || "Use Cases" }
    };
    if (titleEntry) fields.sectionTitle = { [LOCALE]: makeLink(titleEntry.sys.id) };
    if (itemRefs.length) fields.addItem = { [LOCALE]: itemRefs };

    return await upsertEntry(env, CONTENT_TYPE, `usecases-${blockId}`, fields);
}
