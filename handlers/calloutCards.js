/**
 * Handler: calloutCards → calloutCards
 * Craft: calloutCards (repeater with image, heading, description, ctaLink)
 * Contentful: calloutCards { blockId, blockName, addCard: [iconGridItem] }
 */
import { upsertEntry, makeLink, upsertCta, parseCraftLink, resolveInternalUrl, upsertSectionTitle } from "../utils/contentfulHelpers.js";

const LOCALE = "en-US";
const CONTENT_TYPE = "calloutCards";
const ITEM_CONTENT_TYPE = "iconGridItem";

export async function createOrUpdateCalloutCards(env, blockData, assetMap = null, summary = null) {
    try {
        await env.getContentType(CONTENT_TYPE);
    } catch (err) {
        console.warn(`   ⚠ Content type "${CONTENT_TYPE}" not found: ${err.message}. Skipping.`);
        return null;
    }

    const blockId = blockData.blockId || "";
    const fields = blockData.fields || blockData;
    const cards = fields.calloutCards || {};

    const itemRefs = [];

    for (const [cId, card] of Object.entries(cards)) {
        if (typeof card !== "object" || !card.fields) continue;
        const f = card.fields;

        const itemFields = {
            description: { [LOCALE]: f.description || "" }
        };

        // 1. Icon / Image
        if (f.image?.length && assetMap) {
            const assetId = String(f.image[0]);
            const assetInfo = assetMap.get(assetId);
            if (assetInfo) {
                itemFields.icon = { [LOCALE]: { sys: { type: "Link", linkType: "Asset", id: assetInfo.id } } };
            }
        }

        // 2. Title (links to sectionTitle)
        if (f.heading) {
            const titleEntry = await upsertSectionTitle(env, `calloutitem-${cId}`, f.heading);
            if (titleEntry) {
                itemFields.title = { [LOCALE]: makeLink(titleEntry.sys.id) };
            }
        }

        // 3. CTA
        if (f.ctaLink) {
            const linkInfo = parseCraftLink(f.ctaLink);
            let label = linkInfo.label || "Learn More";
            let url = linkInfo.url;

            if (!url && linkInfo.linkedId) {
                url = resolveInternalUrl(linkInfo.linkedId) || "";
            }

            if (url || linkInfo.linkedId) {
                const ctaEntry = await upsertCta(env, `calloutitem-${cId}`, label, url, true, linkInfo.linkedId);
                if (ctaEntry) {
                    itemFields.cta = { [LOCALE]: makeLink(ctaEntry.sys.id) };
                }
            }
        }

        const itemEntry = await upsertEntry(env, ITEM_CONTENT_TYPE, `calloutitem-${cId}`, itemFields);
        if (itemEntry) {
            itemRefs.push(makeLink(itemEntry.sys.id));
        }
    }

    const cfFields = {
        blockId: { [LOCALE]: String(blockId) },
        blockName: { [LOCALE]: blockData.blockName || "Callout Cards" }
    };

    if (itemRefs.length) {
        cfFields.addCard = { [LOCALE]: itemRefs };
    }

    return await upsertEntry(env, CONTENT_TYPE, `callout-cards-${blockId}`, cfFields);
}
