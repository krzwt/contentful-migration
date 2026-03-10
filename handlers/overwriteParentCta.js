import { upsertCta, parseCraftLink, resolveInternalUrl, makeLink } from "../utils/contentfulHelpers.js";

/**
 * Handler: overwriteParentCta (Craft) → cta (Contentful)
 * This block contains a nested 'cta' field which we extract and return as a cta entry.
 */
export async function createOrUpdateOverwriteParentCta(env, blockData, assetMap = null, summary = null) {
    const blockId = blockData.blockId || blockData.id || "";
    const fields = blockData.fields || blockData;

    // The fields object contains a 'cta' field which is another Craft block map
    const ctaMap = fields.cta;
    if (!ctaMap) {
        console.warn(`   ⚠️ No nested cta found in overwriteParentCta block ${blockId}`);
        return null;
    }

    const ctaKeys = Object.keys(ctaMap);
    if (ctaKeys.length === 0) return null;

    const ctaBlock = ctaMap[ctaKeys[0]];
    const cFields = ctaBlock.fields || ctaBlock;

    // Process the CTA data
    const linkInfo = parseCraftLink(cFields.destination);
    const label = cFields.label || linkInfo.label || "Learn More";
    let url = linkInfo.url;

    if (url || label || linkInfo.linkedId) {
        console.log(`   📝 Creating Overwrite Parent CTA [${ctaBlock.id || ctaKeys[0]}] for block ${blockId}`);
        return await upsertCta(env, `overwrite-cta-${blockId}`, label, url, true, linkInfo.linkedId);
    }

    return null;
}
