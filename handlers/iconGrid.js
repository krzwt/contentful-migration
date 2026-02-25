import { upsertEntry, upsertSectionTitle, upsertCta, makeLink, parseCraftLink, resolveInternalUrl } from "../utils/contentfulHelpers.js";

const LOCALE = "en-US";
const CONTENT_TYPE = "iconGrid";
const ITEM_CONTENT_TYPE = "iconGridItem";

/**
 * Handler for iconGrid (nested in contentBlock as type: grid)
 */
export async function createOrUpdateIconGrid(env, id, fields, assetMap, summary = null) {
    try {
        await env.getContentType(CONTENT_TYPE);
    } catch (err) {
        console.warn(`   ⚠ Component "${CONTENT_TYPE}" not found: ${err.message}. Skipping.`);
        return null;
    }

    // 1. Process Section Title if present
    let titleEntry = null;
    if (fields.heading) {
        titleEntry = await upsertSectionTitle(env, `icongrid-${id}`, fields.heading);
    }

    // 2. Process Items
    const items = fields.item || fields.items || {};
    const itemLinks = [];

    // Sort items if they are numeric keys (they usually are)
    const itemKeys = Object.keys(items).sort((a, b) => {
        // Fallback to insertion order if not numeric
        if (isNaN(a) || isNaN(b)) return 0;
        return parseInt(a) - parseInt(b);
    });

    for (const itemId of itemKeys) {
        const itemData = items[itemId];
        const itemFields = itemData.fields || itemData;

        // Create Icon Grid Item
        const itemLink = await createOrUpdateIconGridItem(env, itemId, itemFields, assetMap, summary);
        if (itemLink) {
            itemLinks.push(makeLink(itemLink.sys.id));
        }
    }

    const cfFields = {
        blockId: { [LOCALE]: String(id) },
        blockName: { [LOCALE]: fields.blockName || fields.heading || `Icon Grid ${id}` }
    };

    if (titleEntry) cfFields.sectionTitle = { [LOCALE]: makeLink(titleEntry.sys.id) };
    if (itemLinks.length) cfFields.addItem = { [LOCALE]: itemLinks };

    return await upsertEntry(env, CONTENT_TYPE, `icongrid-${id}`, cfFields);
}

/**
 * Helper to create individual grid items
 */
async function createOrUpdateIconGridItem(env, id, fields, assetMap, summary) {
    const itemFields = {
        description: { [LOCALE]: fields.body || fields.description || "" }
    };

    // 1. Icon
    if (fields.icon?.length && assetMap) {
        const assetId = String(fields.icon[0]);
        const assetInfo = assetMap.get(assetId);
        if (assetInfo) {
            itemFields.icon = { [LOCALE]: { sys: { type: "Link", linkType: "Asset", id: assetInfo.id } } };
        }
    }

    // 2. Title (links to sectionTitle)
    if (fields.heading) {
        const titleEntry = await upsertSectionTitle(env, `griditem-${id}`, fields.heading);
        if (titleEntry) {
            itemFields.title = { [LOCALE]: makeLink(titleEntry.sys.id) };
        }
    }

    // 3. CTA
    if (fields.ctaLink) {
        const linkInfo = parseCraftLink(fields.ctaLink);
        let label = fields.linkText || linkInfo.label || "Learn More";
        let url = linkInfo.url;

        if (!url && linkInfo.linkedId) {
            url = resolveInternalUrl(linkInfo.linkedId) || "";
        }

        if (url || linkInfo.linkedId) {
            const ctaEntry = await upsertCta(env, `griditem-${id}`, label, url, true, linkInfo.linkedId);
            if (ctaEntry) {
                itemFields.cta = { [LOCALE]: makeLink(ctaEntry.sys.id) };
            }
        }
    }

    return await upsertEntry(env, ITEM_CONTENT_TYPE, `griditem-${id}`, itemFields);
}
