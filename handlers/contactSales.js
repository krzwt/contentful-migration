/**
 * Handler: contactSales → contactSales
 * Craft: image, headingLarge, bodyMedium, mainBannerForm
 * Contentful: contactSales { sectionTitle, description, image, addForm }
 * Note: form is skipped for now
 */
import { upsertEntry, upsertSectionTitle, makeLink } from "../utils/contentfulHelpers.js";

const LOCALE = "en-US";
const CONTENT_TYPE = "contactSales";

export async function createOrUpdateContactSales(env, blockData, assetMap = null) {
    try { await env.getContentType(CONTENT_TYPE); } catch (err) {
        console.warn(`   ⚠ Content type "${CONTENT_TYPE}" not found: ${err.message}. Skipping.`);
        return null;
    }

    const blockId = blockData.blockId;
    const heading = blockData.headingLarge || blockData.headingSection || "";

    const titleEntry = await upsertSectionTitle(env, blockId, heading);

    const fields = {
        blockId: { [LOCALE]: String(blockId) },
        blockName: { [LOCALE]: blockData.blockName || heading || `Contact Sales ${blockId}` }
    };
    if (titleEntry) fields.sectionTitle = { [LOCALE]: makeLink(titleEntry.sys.id) };
    if (blockData.bodyMedium) fields.description = { [LOCALE]: blockData.bodyMedium };

    // Handle image
    if (blockData.image?.length && assetMap) {
        const assetInfo = assetMap.get(String(blockData.image[0]));
        if (assetInfo) {
            fields.image = { [LOCALE]: { sys: { type: "Link", linkType: "Asset", id: assetInfo.id } } };
        }
    }

    // Note: mainBannerForm/addForm is skipped for now
    if (blockData.mainBannerForm && Object.keys(blockData.mainBannerForm).length > 0) {
        console.log(`   📋 contactSales has form data — skipped for now`);
    }

    return await upsertEntry(env, CONTENT_TYPE, `contactsales-${blockId}`, fields);
}
