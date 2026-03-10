/**
 * Handler: linkCards → linkCards
 * Craft: linkCards (repeater with heading, body, ctaLink)
 * Contentful: linkCards { blockId, blockName, sectionTitle, description, addCard: [linkCardsItem] }
 * Contentful Items (linkCardsItem): { heading, description, cta }
 */
import { upsertEntry, makeLink, upsertCta, parseCraftLink, resolveInternalUrl, upsertSectionTitle } from "../utils/contentfulHelpers.js";

const LOCALE = "en-US";
const CONTENT_TYPE = "linkCards";
const ITEM_CONTENT_TYPE = "linkCardsItem";

export async function createOrUpdateLinkCards(env, blockData, assetMap = null, summary = null) {
    if (!env) {
        console.log(`   [DRY RUN] Would upsert ${CONTENT_TYPE}`);
        return { sys: { id: `dry-run-lc-${blockData.blockId}` } };
    }
    try {
        await env.getContentType(CONTENT_TYPE);
    } catch (err) {
        console.warn(`   ⚠ Content type "${CONTENT_TYPE}" not found: ${err.message}. Skipping.`);
        return null;
    }

    const blockId = blockData.blockId || "";
    const fields = blockData.fields || blockData;
    const cards = fields.linkCards || {};

    const itemRefs = [];

    // Parse items
    for (const [cId, card] of Object.entries(cards)) {
        if (typeof card !== "object" || !card.fields) continue;
        const f = card.fields;

        const itemFields = {
            heading: { [LOCALE]: f.heading || "" },
            description: { [LOCALE]: f.body || f.description || "" }
        };

        // CTA
        if (f.ctaLink) {
            const linkInfo = parseCraftLink(f.ctaLink);
            let label = f.ctaLinkText || linkInfo.label || "Learn More";
            let url = linkInfo.url;

            if (url || linkInfo.linkedId) {
                const ctaEntry = await upsertCta(env, `lcitem-${cId}`, label, url, true, linkInfo.linkedId);
                if (ctaEntry) {
                    itemFields.cta = { [LOCALE]: makeLink(ctaEntry.sys.id) };
                }
            }
        }

        const itemEntry = await upsertEntry(env, ITEM_CONTENT_TYPE, `lcitem-${cId}`, itemFields);
        if (itemEntry) {
            itemRefs.push(makeLink(itemEntry.sys.id));
        }
    }

    const heading = blockData.headingSection || blockData.heading || "";
    const titleEntry = await upsertSectionTitle(env, blockId, heading);

    const cfFields = {
        blockId: { [LOCALE]: String(blockId) },
        blockName: { [LOCALE]: blockData.blockName || heading || "Link Cards" }
    };

    if (titleEntry) cfFields.sectionTitle = { [LOCALE]: makeLink(titleEntry.sys.id) };
    if (blockData.body250) cfFields.description = { [LOCALE]: blockData.body250 };
    if (itemRefs.length) {
        cfFields.addCard = { [LOCALE]: itemRefs };
    }

    return await upsertEntry(env, CONTENT_TYPE, `link-cards-${blockId}`, cfFields);
}
