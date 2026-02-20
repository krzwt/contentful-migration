/**
 * Handler: accordion → accordion
 * Craft: headingSection, body250, accordion (nested groups with rows: heading, body)
 * Contentful: accordion { blockId, blockName, sectionTitle, description, addAccordion: [accordionItem] }
 */
import { upsertEntry, upsertSectionTitle, makeLink } from "../utils/contentfulHelpers.js";
import { convertHtmlToRichText } from "../utils/richText.js";

const LOCALE = "en-US";
const CONTENT_TYPE = "accordion";

export async function createOrUpdateAccordion(env, blockData, assetMap = null) {
    try { await env.getContentType(CONTENT_TYPE); } catch (err) {
        console.warn(`   ⚠ Content type "${CONTENT_TYPE}" not found: ${err.message}. Skipping.`);
        return null;
    }

    const blockId = blockData.blockId;
    const heading = blockData.headingSection || blockData.heading || "";

    const titleEntry = await upsertSectionTitle(env, blockId, heading);

    const accordionRefs = [];
    const accData = blockData.accordion || {};

    for (const [aId, accGroup] of Object.entries(accData)) {
        if (typeof accGroup !== "object" || !accGroup.fields) continue;
        const rows = accGroup.fields?.rows || {};

        for (const [rowId, row] of Object.entries(rows)) {
            if (typeof row !== "object" || !row.fields) continue;
            const f = row.fields;

            const itemFields = {
                heading: { [LOCALE]: f.heading || "" },
                description: { [LOCALE]: await convertHtmlToRichText(env, f.body || "") }
            };

            const itemEntry = await upsertEntry(env, "accordionItem", `acc-${rowId}`, itemFields);
            if (itemEntry) accordionRefs.push(makeLink(itemEntry.sys.id));
        }
    }

    const fields = {
        blockId: { [LOCALE]: blockId },
        blockName: { [LOCALE]: blockData.blockName || heading || "Accordion" }
    };
    if (titleEntry) fields.sectionTitle = { [LOCALE]: makeLink(titleEntry.sys.id) };
    if (blockData.body250) fields.description = { [LOCALE]: blockData.body250 };
    if (accordionRefs.length) fields.addAccordion = { [LOCALE]: accordionRefs };

    return await upsertEntry(env, CONTENT_TYPE, `accordion-${blockId}`, fields);
}
