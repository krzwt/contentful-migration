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
    let bodyHtml = blockData.bodyMedium || blockData.body || "";

    // Process "list" repeater/matrix if present
    const listData = blockData.list || {};
    const listItems = [];

    // Recursive function to extract items from nested structures
    const extractItems = (data) => {
        if (!data) return;
        if (typeof data === 'object' && !Array.isArray(data)) {
            // Check if this is a block with an "item" or "text" field
            if (data.fields?.item || data.fields?.text) {
                listItems.push(data.fields.item || data.fields.text);
            } else if (data.fields) {
                // Otherwise iterate through its fields (it might be a block like 'listing')
                Object.values(data.fields).forEach(val => {
                    if (val && typeof val === 'object') extractItems(val);
                });
            } else {
                // Could be a container object with IDs as keys
                Object.values(data).forEach(val => {
                    if (val && typeof val === 'object') extractItems(val);
                });
            }
        } else if (Array.isArray(data)) {
            data.forEach(item => extractItems(item));
        }
    };

    extractItems(listData);

    if (listItems.length > 0) {
        console.log(`   📝 tryItCta: Extracted ${listItems.length} list items: ${listItems.join(', ').substring(0, 50)}...`);
        // Consolidate list items into HTML <ul>
        const listHtml = `<ul>${listItems.map(it => `<li>${it}</li>`).join('')}</ul>`;
        bodyHtml = bodyHtml ? `${bodyHtml}<br/>${listHtml}` : listHtml;
    }

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
