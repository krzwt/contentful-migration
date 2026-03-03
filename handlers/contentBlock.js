import { convertHtmlToRichText } from "../utils/richText.js";
import { upsertCta, upsertSectionTitle, parseCraftLink, resolveInternalUrl } from "../utils/contentfulHelpers.js";
import { createOrUpdateFiftyFifty } from "./fiftyFifty.js";
import { createOrUpdateIconGrid } from "./iconGrid.js";
import { createOrUpdateMediaBlock } from "./mediaBlock.js";
import { getOrderedKeys } from "../utils/jsonOrder.js";


const LOCALE = "en-US";
const CONTENT_TYPE = "contentBlock";

/**
 * Custom handler for contentBlock (Overview Content Standalone)
 */
export async function createOrUpdateContentBlock(env, blockData, assetMap = null, summary = null) {
    // 1. Verify Content Type exists
    try {
        await env.getContentType(CONTENT_TYPE);
    } catch (err) {
        console.warn(`   ⚠ Component "${CONTENT_TYPE}" not founded in contentful or error: ${err.message}. Skipping block ${blockData.blockId}.`);
        return null;
    }

    let existing;
    try {
        existing = await env.getEntries({
            content_type: CONTENT_TYPE,
            "fields.blockId": blockData.blockId,
            limit: 1
        });
    } catch (err) {
        console.error(`   🛑 Error fetching existing entries for "${CONTENT_TYPE}":`, err.message);
        return null;
    }

    /* -----------------------------
       NESTED ENTRIES
    ------------------------------ */

    // 1. Section Title
    let titleEntry = null;
    if (blockData.headingSection) {
        titleEntry = await upsertSectionTitle(env, blockData.blockId, blockData.headingSection);
    }

    // 2. CTA
    let ctaEntry = null;
    const linkInfo = parseCraftLink(blockData.ctaLink);
    const label = blockData.label || blockData.ctaText || linkInfo.label || "";
    let url = linkInfo.url;

    if (!url && linkInfo.linkedId) {
        url = resolveInternalUrl(linkInfo.linkedId) || "";
    }

    if (label || url || linkInfo.linkedId) {
        ctaEntry = await upsertCta(env, blockData.blockId, label, url, true, linkInfo.linkedId);
    }

    /* -----------------------------
       CONTENT BLOCK FIELDS
    ------------------------------ */
    const fields = {
        blockId: { [LOCALE]: blockData.blockId },
        blockName: { [LOCALE]: blockData.blockName || blockData.headingSection || "Content Block" },
        description: { [LOCALE]: await convertHtmlToRichText(env, blockData.body || blockData.bodyRedactorRestricted || "") }
    };

    if (titleEntry) {
        fields.sectionTitle = {
            [LOCALE]: {
                sys: { type: "Link", linkType: "Entry", id: titleEntry.sys.id }
            }
        };
    }

    if (ctaEntry) {
        fields.cta = {
            [LOCALE]: {
                sys: { type: "Link", linkType: "Entry", id: ctaEntry.sys.id }
            }
        };
    }

    // 3. Full Width CTA (New)
    let fullWidthCtaEntry = null;
    if (blockData.fullWidthCta) {
        // If it's already an entry (from our lookahead logic)
        if (blockData.fullWidthCta.sys && blockData.fullWidthCta.sys.type === 'Entry') {
            fullWidthCtaEntry = blockData.fullWidthCta;
        } else {
            // Otherwise, it might be raw CTA data if nested (less likely but good to have)
            const fwLinkInfo = parseCraftLink(blockData.fullWidthCtaLink || blockData.fullWidthCta.ctaLink);
            const fwLabel = blockData.fullWidthCtaLabel || blockData.fullWidthCta.label || fwLinkInfo.label || "";
            let fwUrl = fwLinkInfo.url;
            if (!fwUrl && fwLinkInfo.linkedId) fwUrl = resolveInternalUrl(fwLinkInfo.linkedId) || "";

            if (fwLabel || fwUrl || fwLinkInfo.linkedId) {
                fullWidthCtaEntry = await upsertCta(env, `fw-${blockData.blockId}`, fwLabel, fwUrl, true, fwLinkInfo.linkedId);
            }
        }
    }

    if (fullWidthCtaEntry) {
        fields.fullWidthCta = {
            [LOCALE]: {
                sys: { type: "Link", linkType: "Entry", id: fullWidthCtaEntry.sys.id }
            }
        };
    }

    let entry;
    if (existing.items.length) {
        entry = existing.items[0];
        console.log("🔄 Updating existing contentBlock:", entry.sys.id);
        entry.fields = fields;
        entry = await entry.update();
        entry = await entry.publish();
    } else {
        console.log("✨ Creating new contentBlock");
        entry = await env.createEntry(CONTENT_TYPE, { fields });
        entry = await entry.publish();
    }

    const results = [entry];

    // Process nested subsections (e.g. contentWithAsset -> fiftyFiftyComponent)
    if (blockData.contentSubsections || blockData.contentSubSections) {
        const subsections = blockData.contentSubsections || blockData.contentSubSections;
        if (typeof subsections === "object" && !Array.isArray(subsections)) {
            const orderedSubIds = getOrderedKeys(blockData.blockSegment, subsections);

            for (const subId of orderedSubIds) {
                const subData = subsections[subId];
                if (!subData.enabled) continue;

                // Extract sub-segment for deeper nesting (e.g. grid items)
                const sIdx = blockData.blockSegment.indexOf(`"${subId}":`);
                const nextSId = orderedSubIds[orderedSubIds.indexOf(subId) + 1];
                const nextSIdx = nextSId ? blockData.blockSegment.indexOf(`"${nextSId}":`) : blockData.blockSegment.length;
                const subSegment = blockData.blockSegment.substring(sIdx, nextSIdx);

                const subType = subData.type;
                const subFields = subData.fields || subData;
                let subEntry = null;

                const passData = { blockId: subId, blockSegment: subSegment, ...subFields };

                if (subType === "contentWithAsset") {
                    console.log(`✅ Detected nested contentWithAsset (ID: ${subId}) inside contentBlock ${blockData.blockId}`);
                    subEntry = await createOrUpdateFiftyFifty(env, subId, subFields, assetMap, summary);
                } else if (subType === "cta") {
                    // Merge nested CTA into the parent Content Block's fullWidthCta field
                    console.log(`✅ Detected nested cta (ID: ${subId}) inside contentBlock ${blockData.blockId} -> fullWidthCta`);
                    const rawCtaLink = subFields.contentCTA || subFields.ctaLink;
                    if (rawCtaLink) {
                        const ctaLinkInfo = parseCraftLink(rawCtaLink);
                        const ctaLabel = subFields.customLinkText || subFields.label || subFields.linkText || ctaLinkInfo.label || "";
                        let ctaUrl = ctaLinkInfo.url;
                        if (!ctaUrl && ctaLinkInfo.linkedId) ctaUrl = resolveInternalUrl(ctaLinkInfo.linkedId) || "";

                        if (ctaLabel || ctaUrl || ctaLinkInfo.linkedId) {
                            const fwCta = await upsertCta(env, `contentcta-${subId}`, ctaLabel, ctaUrl, true, ctaLinkInfo.linkedId);
                            if (fwCta) {
                                // Re-fetch the content block entry and set fullWidthCta
                                const freshEntry = await env.getEntry(entry.sys.id);
                                freshEntry.fields.fullWidthCta = {
                                    [LOCALE]: { sys: { type: "Link", linkType: "Entry", id: fwCta.sys.id } }
                                };
                                const updatedEntry = await freshEntry.update();
                                await updatedEntry.publish();
                                console.log(`   🔗 Linked CTA "${ctaLabel}" to Content Block fullWidthCta`);
                            }
                        }
                    }
                    // Do NOT add to results - this is merged into the content block, not a separate section
                    subEntry = null;
                } else if (subType === "grid") {
                    console.log(`✅ Detected nested grid (ID: ${subId}) inside contentBlock ${blockData.blockId} -> iconGrid`);
                    subEntry = await createOrUpdateIconGrid(env, subId, passData, assetMap, summary);
                } else if (subType === "fullWidthAsset") {
                    console.log(`✅ Detected nested fullWidthAsset (ID: ${subId}) inside contentBlock ${blockData.blockId} -> mediaBlock`);
                    subEntry = await createOrUpdateMediaBlock(env, subId, subFields, assetMap, summary);
                }

                if (subEntry) {
                    results.push(subEntry);
                }
            }
        }
    }

    return results;
}
