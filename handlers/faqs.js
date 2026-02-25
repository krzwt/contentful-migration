/**
 * Handler: faqs → faQs
 * Craft: headingSection, faqs (nested groups with faq items: question, answer)
 * Contentful: faQs { sectionTitle, addFaQs: [faQsItem] }
 */
import { upsertEntry, upsertSectionTitle, makeLink } from "../utils/contentfulHelpers.js";
import { getOrderedKeys } from "../utils/jsonOrder.js";

const LOCALE = "en-US";
const CONTENT_TYPE = "faQs";

export async function createOrUpdateFaqs(env, blockData, assetMap = null) {
    try { await env.getContentType(CONTENT_TYPE); } catch (err) {
        console.warn(`   ⚠ Content type "${CONTENT_TYPE}" not found: ${err.message}. Skipping.`);
        return null;
    }

    const blockId = blockData.blockId;
    const heading = blockData.headingSection || "";

    const titleEntry = await upsertSectionTitle(env, blockId, heading);

    const faqRefs = [];
    const faqsData = blockData.faqs || {};

    const orderedGIds = getOrderedKeys(blockData.blockSegment, faqsData);
    for (const gId of orderedGIds) {
        const faqGroup = faqsData[gId];
        if (typeof faqGroup !== "object" || !faqGroup.fields) continue;

        // Extract group segment
        const gIdx = blockData.blockSegment.indexOf(`"${gId}":`);
        const nextGId = orderedGIds[orderedGIds.indexOf(gId) + 1];
        const nextGIdx = nextGId ? blockData.blockSegment.indexOf(`"${nextGId}":`) : blockData.blockSegment.length;
        const groupSegment = blockData.blockSegment.substring(gIdx, nextGIdx);

        const faqItems = faqGroup.fields?.faqs || {};
        const orderedItemIds = getOrderedKeys(groupSegment, faqItems);

        for (const fId of orderedItemIds) {
            const faq = faqItems[fId];
            if (typeof faq !== "object" || !faq.fields) continue;
            const f = faq.fields;

            const itemFields = {
                question: { [LOCALE]: f.question || "" },
                answer: { [LOCALE]: f.answer || "" }
            };

            const itemEntry = await upsertEntry(env, "faQsItem", `faq-${fId}`, itemFields);
            if (itemEntry) faqRefs.push(makeLink(itemEntry.sys.id));
        }
    }

    const fields = {};
    if (titleEntry) fields.sectionTitle = { [LOCALE]: makeLink(titleEntry.sys.id) };
    if (faqRefs.length) fields.addFaQs = { [LOCALE]: faqRefs };

    return await upsertEntry(env, CONTENT_TYPE, `faqs-${blockId}`, fields);
}
