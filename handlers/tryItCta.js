/**
 * Handler: tryItCta → tryItCta
 * Craft: headingSection, image, headingLarge, bodyMedium, list, mainBannerForm
 * Contentful: tryItCta { blockId, blockName, sectionTitle [REQ], image [REQ], contentHeading [REQ], description (RichText), forms }
 */
import { upsertEntry, upsertSectionTitle, makeLink } from "../utils/contentfulHelpers.js";
import { convertHtmlToRichText } from "../utils/richText.js";

const LOCALE = "en-US";
const CONTENT_TYPE = "tryItCta";

export async function createOrUpdateTryCta(env, blockData, assetMap = null) {
    try { await env.getContentType(CONTENT_TYPE); } catch (err) {
        console.warn(`   ⚠ Content type "${CONTENT_TYPE}" not found: ${err.message}. Skipping.`);
        return null;
    }

    const blockId = blockData.blockId;
    const heading = blockData.headingSection || blockData.headingLarge || "Try It CTA";

    // Section Title (REQUIRED)
    const titleEntry = await upsertSectionTitle(env, blockId, heading);
    if (!titleEntry) {
        console.warn(`   ⚠ Could not create section title for tryItCta ${blockId}. Skipping.`);
        return null;
    }

    const fields = {
        blockId: { [LOCALE]: blockId },
        blockName: { [LOCALE]: blockData.blockName || heading || "Try It CTA" },
        sectionTitle: { [LOCALE]: makeLink(titleEntry.sys.id) },
        contentHeading: { [LOCALE]: blockData.headingLarge || heading || "Try It CTA" }
    };

    // Description (bodyMedium → RichText)
    const bodyHtml = blockData.bodyMedium || blockData.body || "";
    if (bodyHtml) {
        fields.description = { [LOCALE]: await convertHtmlToRichText(env, bodyHtml) };
    }

    // Handle image (REQUIRED — use first available or skip)
    if (blockData.image?.length && assetMap) {
        const assetInfo = assetMap.get(String(blockData.image[0]));
        if (assetInfo && assetInfo.id) {
            fields.image = { [LOCALE]: { sys: { type: "Link", linkType: "Asset", id: assetInfo.id } } };
        }
    }

    // Note: forms reference is skipped for now (would need a forms handler)
    if (blockData.mainBannerForm && Object.keys(blockData.mainBannerForm).length > 0) {
        console.log(`   📋 tryItCta has form data — skipped for now`);
    }

    return await upsertEntry(env, CONTENT_TYPE, `trycta-${blockId}`, fields);
}
