import { convertHtmlToRichText } from "../utils/richText.js";
import { upsertEntry, upsertCta, upsertSectionTitle, makeLink, parseCraftLink, resolveInternalUrl, resolveEntryRef } from "../utils/contentfulHelpers.js";
import { createOrUpdateFiftyFifty } from "./fiftyFifty.js";
import { createOrUpdateIconGrid } from "./iconGrid.js";
import { createOrUpdateMediaBlock } from "./mediaBlock.js";
import { getOrderedKeys } from "../utils/jsonOrder.js";


const LOCALE = "en-US";
const DEFAULT_CONTENT_TYPE = "contentBlock";

const BLOCK_LAYOUT_MAP = {
    "shift-right": "Right",
    "right": "Right",
    "shift-left": "Left",
    "left": "Left",
    "u--right-aligned-bottom": "Right, Bottom-aligned",
    "right-bottom": "Right, Bottom-aligned",
    "u--left-aligned-bottom": "Left, Bottom-aligned",
    "left-bottom": "Left, Bottom-aligned",
};
const REVIEW_EMBED_MAP = {
    gartner: "Gartner",
    g2: "G2",
    trustRadiusRemoteSupport: "Trust Radius Remote Support",
    trustRadiusPrivilegedRemoteAccess: "Trust Radius Privileged Remote Access",
    trustRadiusEndpointPrivilegeManagement: "Trust Radius Endpoint Privilege Management",
};

/**
 * Custom handler for contentBlock (Overview Content Standalone) and Content Block (Resources) → contentBlocks
 */
export async function createOrUpdateContentBlock(env, blockData, assetMap = null, summary = null) {
    if (!env) {
        return { sys: { id: `dry-run-contentBlock-${blockData.blockId}` } };
    }
    const contentType = blockData._targetContentType || DEFAULT_CONTENT_TYPE;
    const isContentBlocks = contentType === "contentBlocks";

    try {
        await env.getContentType(contentType);
    } catch (err) {
        console.warn(`   ⚠ Component "${contentType}" not found in contentful or error: ${err.message}. Skipping block ${blockData.blockId}.`);
        return null;
    }

    let existing;
    try {
        existing = await env.getEntries({
            content_type: contentType,
            "fields.blockId": blockData.blockId,
            limit: 1
        });
    } catch (err) {
        console.error(`   🛑 Error fetching existing entries for "${contentType}":`, err.message);
        return null;
    }

    /* -----------------------------
       NESTED ENTRIES
    ------------------------------ */

    // 1. Section Title (Block Heading in Content Block Resources is Link to sectionTitle)
    const headingText = blockData.headingSection || blockData.heading || blockData.blockHeading || "";
    let titleEntry = null;
    if (headingText && String(headingText).trim()) {
        titleEntry = await upsertSectionTitle(env, blockData.blockId, String(headingText).trim());
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
       contentBlock: sectionTitle, description, cta, fullWidthCta
       contentBlocks (Resources): blockHeading, blockBody (no cta/fullWidthCta)
    ------------------------------ */
    const bodyRich = await convertHtmlToRichText(env, blockData.body || blockData.bodyRedactorRestricted || "");
    const fields = {
        blockId: { [LOCALE]: blockData.blockId },
        blockName: { [LOCALE]: blockData.blockName || headingText || "Content Block" },
    };
    if (isContentBlocks) {
        fields.blockBody = { [LOCALE]: bodyRich };
        if (titleEntry?.sys?.id) {
            fields.blockHeading = { [LOCALE]: { sys: { type: "Link", linkType: "Entry", id: titleEntry.sys.id } } };
        }
        if (blockData.mediaCaption != null && blockData.mediaCaption !== "") {
            fields.mediaCaption = { [LOCALE]: String(blockData.mediaCaption) };
        }
        if (blockData.blockLayout) {
            const layout = BLOCK_LAYOUT_MAP[blockData.blockLayout] || (blockData.blockLayout.includes("left") ? "Left" : "Right");
            fields.blockLayout = { [LOCALE]: layout };
        }
        if (blockData.reviewEmbed) {
            const embed = REVIEW_EMBED_MAP[blockData.reviewEmbed] || blockData.reviewEmbed;
            if (REVIEW_EMBED_MAP[blockData.reviewEmbed] || ["Gartner", "G2", "Trust Radius Remote Support", "Trust Radius Privileged Remote Access", "Trust Radius Endpoint Privilege Management"].includes(embed)) {
                fields.reviewEmbed = { [LOCALE]: embed };
            }
        }
        const resourceIds = Array.isArray(blockData.resource) ? blockData.resource : (blockData.resource ? [blockData.resource] : []);
        const resourceCraftId = resourceIds[0];
        if (resourceCraftId) {
            const ref = resolveEntryRef(resourceCraftId);
            if (ref?.type === "resourcesCpt" && ref?.id) {
                fields.resource = { [LOCALE]: makeLink(ref.id) };
            }
        }
        const blockImageIds = Array.isArray(blockData.blockImage) ? blockData.blockImage : (blockData.blockImage ? [blockData.blockImage] : []);
        const craftAssetId = blockImageIds[0];
        if (craftAssetId != null && assetMap?.get(String(craftAssetId))?.id) {
            fields.blockAsset = { [LOCALE]: { sys: { type: "Link", linkType: "Entry", id: assetMap.get(String(craftAssetId)).id } } };
        } else if (blockImageIds.length > 0) {
            fields.blockAsset = { [LOCALE]: null };
        }
    } else {
        fields.description = { [LOCALE]: bodyRich };
        if (titleEntry?.sys?.id) {
            fields.sectionTitle = { [LOCALE]: { sys: { type: "Link", linkType: "Entry", id: titleEntry.sys.id } } };
        }
        const ctaId = ctaEntry?.sys?.id;
        fields.cta = { [LOCALE]: ctaId ? makeLink(ctaId) : null };
    }

    if (!isContentBlocks) {
        let fullWidthCtaEntry = null;
        if (blockData.fullWidthCta) {
            if (blockData.fullWidthCta.sys && blockData.fullWidthCta.sys.type === 'Entry') {
                fullWidthCtaEntry = blockData.fullWidthCta;
            } else {
                const fwLinkInfo = parseCraftLink(blockData.fullWidthCtaLink || blockData.fullWidthCta?.ctaLink);
                const fwLabel = blockData.fullWidthCtaLabel || blockData.fullWidthCta?.label || fwLinkInfo.label || "";
                let fwUrl = fwLinkInfo.url;
                if (!fwUrl && fwLinkInfo.linkedId) fwUrl = resolveInternalUrl(fwLinkInfo.linkedId) || "";
                if (fwLabel || fwUrl || fwLinkInfo.linkedId) {
                    fullWidthCtaEntry = await upsertCta(env, `fw-${blockData.blockId}`, fwLabel, fwUrl, true, fwLinkInfo.linkedId);
                }
            }
        }
        const fwCtaId = fullWidthCtaEntry?.sys?.id;
        fields.fullWidthCta = { [LOCALE]: fwCtaId ? makeLink(fwCtaId) : null };
    }

    let entry;
    if (existing.items.length) {
        entry = existing.items[0];
        console.log("🔄 Updating existing", contentType + ":", entry.sys.id);
        entry.fields = fields;
        entry = await entry.update();
        entry = await entry.publish();
    } else {
        console.log("✨ Creating new", contentType);
        entry = await env.createEntry(contentType, { fields });
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
                    // Create a SEPARATE Content Block for this CTA to maintain sequential order
                    console.log(`✅ Creating separate Content Block for nested cta (ID: ${subId}) to preserve order`);
                    const rawCtaLink = subFields.contentCTA || subFields.ctaLink;
                    if (rawCtaLink) {
                        const ctaLinkInfo = parseCraftLink(rawCtaLink);
                        const ctaLabel = subFields.customLinkText || subFields.label || subFields.linkText || ctaLinkInfo.label || "";
                        let ctaUrl = ctaLinkInfo.url;
                        if (!ctaUrl && ctaLinkInfo.linkedId) ctaUrl = resolveInternalUrl(ctaLinkInfo.linkedId) || "";

                        if (ctaLabel || ctaUrl || ctaLinkInfo.linkedId) {
                            const fwCta = await upsertCta(env, `subcta-${subId}`, ctaLabel, ctaUrl, true, ctaLinkInfo.linkedId);
                            const fwCtaId = fwCta?.sys?.id;
                            if (fwCtaId && !isContentBlocks) {
                                const ctaWrapperFields = {
                                    blockId: { [LOCALE]: String(subId) },
                                    blockName: { [LOCALE]: `CTA Block: ${ctaLabel}` },
                                    fullWidthCta: { [LOCALE]: makeLink(fwCtaId) }
                                };
                                const ctaBlockEntry = await upsertEntry(env, DEFAULT_CONTENT_TYPE, `contentcta-wrapper-${subId}`, ctaWrapperFields);
                                if (ctaBlockEntry) {
                                    results.push(ctaBlockEntry);
                                    console.log(`   ✨ Created separate Content Block wrapper for CTA "${ctaLabel}"`);
                                }
                            }
                        }
                    }
                    subEntry = null; // Already added to results via results.push(ctaBlockEntry)
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
