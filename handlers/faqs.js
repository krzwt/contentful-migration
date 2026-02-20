/**
 * Handler: faqs → faQs
 * Craft: headingSection, faqs (nested groups with faq items: question, answer)
 * Contentful: faQs { sectionTitle, addFaQs: [faQsItem] }
 */
import { upsertEntry, upsertSectionTitle, makeLink } from "../utils/contentfulHelpers.js";

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

    for (const [gId, faqGroup] of Object.entries(faqsData)) {
        if (typeof faqGroup !== "object" || !faqGroup.fields) continue;
        const faqItems = faqGroup.fields?.faqs || {};

        for (const [fId, faq] of Object.entries(faqItems)) {
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
