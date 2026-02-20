/**
 * Handler: tryItCta → trustCta (skipping form for now)
 * Craft: headingSection, image, headingLarge, bodyMedium, list, mainBannerForm
 * Contentful: trustCta { blockId, blockName, sectionTitle, description, image }
 */
import { upsertEntry, upsertSectionTitle, makeLink } from "../utils/contentfulHelpers.js";

const LOCALE = "en-US";
const CONTENT_TYPE = "trustCta";

export async function createOrUpdateTryCta(env, blockData, assetMap = null) {
    try { await env.getContentType(CONTENT_TYPE); } catch (err) {
        console.warn(`   ⚠ Content type "${CONTENT_TYPE}" not found: ${err.message}. Skipping.`);
        return null;
    }

    const blockId = blockData.blockId;
    const heading = blockData.headingSection || blockData.headingLarge || "";

    const titleEntry = await upsertSectionTitle(env, blockId, heading);

    const fields = {
        blockId: { [LOCALE]: blockId },
        blockName: { [LOCALE]: blockData.blockName || heading || "Trust CTA" },
        description: { [LOCALE]: blockData.bodyMedium || "" }
    };
    if (titleEntry) fields.sectionTitle = { [LOCALE]: makeLink(titleEntry.sys.id) };

    // Handle image
    if (blockData.image?.length && assetMap) {
        const assetInfo = assetMap.get(String(blockData.image[0]));
        if (assetInfo) {
            fields.image = { [LOCALE]: { sys: { type: "Link", linkType: "Asset", id: assetInfo.id } } };
        }
    }

    // Note: mainBannerForm is skipped for now
    if (blockData.mainBannerForm && Object.keys(blockData.mainBannerForm).length > 0) {
        console.log(`   📋 tryItCta has form data — skipped for now`);
    }

    return await upsertEntry(env, CONTENT_TYPE, `trustcta-${blockId}`, fields);
}
