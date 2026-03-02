import { upsertEntry, upsertCta, upsertSectionTitle, makeLink, parseCraftLink, resolveInternalUrl } from "../utils/contentfulHelpers.js";
import { mapBackgroundColor } from "../utils/colorMap.js";

const LOCALE = "en-US";
const CONTENT_TYPE = "ctaBlock";

/**
 * Handler: ctaBlock → ctaBlock
 */
export async function createOrUpdateCtaBlock(env, blockData, assetMap = null, summary = null) {
    try {
        await env.getContentType(CONTENT_TYPE);
    } catch (err) {
        console.warn(`   ⚠ Component "${CONTENT_TYPE}" not found: ${err.message}. Skipping.`);
        return null;
    }

    const blockId = blockData.blockId || "";
    const fields = blockData.fields || blockData;

    // 1. Process Section Title
    let titleEntry = null;
    const heading = fields.headingSection || fields.heading || "";
    if (heading) {
        titleEntry = await upsertSectionTitle(env, blockId, heading);
    }

    // 2. Process CTA
    let ctaEntry = null;
    const rawLink = fields.ctaLink || fields.contentCTA;
    if (rawLink) {
        const linkInfo = parseCraftLink(rawLink);
        let label = fields.label || fields.linkText || fields.customLinkText || linkInfo.label || "Learn More";
        let url = linkInfo.url;

        if (!url && linkInfo.linkedId) {
            url = resolveInternalUrl(linkInfo.linkedId) || "";
        }

        if (url || label || linkInfo.linkedId) {
            ctaEntry = await upsertCta(env, `ctablock-${blockId}`, label, url, true, linkInfo.linkedId);
        }
    }

    const cfFields = {
        blockId: { [LOCALE]: String(blockId) },
        blockName: { [LOCALE]: fields.blockName || heading || "CTA Block" },
        selectBackgroundColor: { [LOCALE]: mapBackgroundColor(fields.backgroundColor) }
    };

    if (titleEntry) cfFields.sectionTitle = { [LOCALE]: makeLink(titleEntry.sys.id) };
    if (ctaEntry) cfFields.cta = { [LOCALE]: makeLink(ctaEntry.sys.id) };

    return await upsertEntry(env, CONTENT_TYPE, `ctablock-${blockId}`, cfFields);
}
