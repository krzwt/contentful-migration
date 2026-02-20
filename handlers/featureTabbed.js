/**
 * Handler: featureTabbed → featureTabbed
 * Craft: headingSection, bodyRedactorRestricted, contentAsset (image), featureTabbed (tabs with heading, body, ctaLink)
 * Contentful: featureTabbed { sectionTitle, description, addAsset, addFeatureTabbedItem: [featureTabbedItem] }
 */
import { upsertEntry, upsertSectionTitle, upsertAssetWrapper, upsertCta, makeLink, parseCraftLink } from "../utils/contentfulHelpers.js";
import { convertHtmlToRichText } from "../utils/richText.js";

const LOCALE = "en-US";
const CONTENT_TYPE = "featureTabbed";

export async function createOrUpdateFeatureTabbed(env, blockData, assetMap = null) {
    try { await env.getContentType(CONTENT_TYPE); } catch (err) {
        console.warn(`   ⚠ Content type "${CONTENT_TYPE}" not found: ${err.message}. Skipping.`);
        return null;
    }

    const blockId = blockData.blockId;
    const heading = blockData.headingSection || "";

    const titleEntry = await upsertSectionTitle(env, blockId, heading);

    // Handle image asset
    let assetEntry = null;
    const contentAsset = blockData.contentAsset || {};
    for (const [caId, ca] of Object.entries(contentAsset)) {
        if (typeof ca !== "object" || !ca.fields) continue;
        const imgIds = ca.fields?.image || [];
        if (imgIds.length && assetMap) {
            const assetInfo = assetMap.get(String(imgIds[0]));
            if (assetInfo) {
                assetEntry = await upsertAssetWrapper(env, `ft-${blockId}`, assetInfo.id, assetInfo.mimeType, assetInfo.wistiaUrl);
            }
        }
    }

    // Create tabbed items
    const tabRefs = [];
    const tabbedData = blockData.featureTabbed || {};

    for (const [tId, tab] of Object.entries(tabbedData)) {
        if (typeof tab !== "object" || !tab.fields) continue;
        const f = tab.fields;

        let ctaEntry = null;
        const link = parseCraftLink(f.ctaLink);
        if (link.url || f.ctaLabel) {
            ctaEntry = await upsertCta(env, `ft-${tId}`, f.ctaLabel || link.label || "", link.url);
        }

        const itemFields = {
            tabLink: { [LOCALE]: f.tabLink || f.heading || "" },
            heading: { [LOCALE]: f.heading || "" },
            description: { [LOCALE]: await convertHtmlToRichText(env, f.body || "") }
        };
        if (ctaEntry) itemFields.cta = { [LOCALE]: makeLink(ctaEntry.sys.id) };

        const itemEntry = await upsertEntry(env, "featureTabbedItem", `ftitem-${tId}`, itemFields);
        if (itemEntry) tabRefs.push(makeLink(itemEntry.sys.id));
    }

    const fields = {};
    if (titleEntry) fields.sectionTitle = { [LOCALE]: makeLink(titleEntry.sys.id) };
    if (blockData.bodyRedactorRestricted) {
        fields.description = { [LOCALE]: blockData.bodyRedactorRestricted };
    }
    if (assetEntry) fields.addAsset = { [LOCALE]: makeLink(assetEntry.sys.id) };
    if (tabRefs.length) fields.addFeatureTabbedItem = { [LOCALE]: tabRefs };

    return await upsertEntry(env, CONTENT_TYPE, `feattab-${blockId}`, fields);
}
