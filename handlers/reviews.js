/**
 * Handler: reviews → reviewsBlock
 * Craft: headingSection, body250, reviews (nested items with star, reviewDescription, author)
 * Contentful: reviewsBlock { blockId, blockName, sectionTitle, description, addReviews: [reviewItem], cta }
 */
import { upsertEntry, upsertSectionTitle, makeLink } from "../utils/contentfulHelpers.js";
import { getOrderedKeys } from "../utils/jsonOrder.js";

const LOCALE = "en-US";
const CONTENT_TYPE = "reviewsBlock";

export async function createOrUpdateReviews(env, blockData, assetMap = null) {
    try { await env.getContentType(CONTENT_TYPE); } catch (err) {
        console.warn(`   ⚠ Content type "${CONTENT_TYPE}" not found: ${err.message}. Skipping.`);
        return null;
    }

    const blockId = blockData.blockId;
    const heading = blockData.headingSection || blockData.heading || "";

    const titleEntry = await upsertSectionTitle(env, blockId, heading);

    const reviewRefs = [];
    const reviewsData = blockData.reviews || {};

    const orderedRIds = getOrderedKeys(blockData.blockSegment, reviewsData);
    for (const rId of orderedRIds) {
        const review = reviewsData[rId];
        if (typeof review !== "object" || !review.fields) continue;

        // Extract review segment
        const rIdx = blockData.blockSegment.indexOf(`"${rId}":`);
        const nextRId = orderedRIds[orderedRIds.indexOf(rId) + 1];
        const nextRIdx = nextRId ? blockData.blockSegment.indexOf(`"${nextRId}":`) : blockData.blockSegment.length;
        const reviewSegment = blockData.blockSegment.substring(rIdx, nextRIdx);

        const f = review.fields;
        const rows = f.rows || {};
        const orderedRowIds = getOrderedKeys(reviewSegment, rows);

        if (orderedRowIds.length > 0) {
            for (const rowId of orderedRowIds) {
                const row = rows[rowId];
                if (typeof row !== "object" || !row.fields) continue;
                const rf = row.fields;
                const itemFields = {
                    star: { [LOCALE]: parseInt(rf.star) || 5 },
                    review: { [LOCALE]: rf.reviewDescription || rf.body || "" },
                    author: { [LOCALE]: rf.author || "" }
                };
                if (rf.reviewUrl) itemFields.reviewUrl = { [LOCALE]: rf.reviewUrl };

                const itemEntry = await upsertEntry(env, "reviewItem", `review-${rowId}`, itemFields);
                if (itemEntry) reviewRefs.push(makeLink(itemEntry.sys.id));
            }
        } else {
            // Flat structure
            const itemFields = {
                star: { [LOCALE]: parseInt(f.star) || 5 },
                review: { [LOCALE]: f.reviewDescription || f.body || "" },
                author: { [LOCALE]: f.author || "" }
            };
            if (f.reviewUrl) itemFields.reviewUrl = { [LOCALE]: f.reviewUrl };

            const itemEntry = await upsertEntry(env, "reviewItem", `review-${rId}`, itemFields);
            if (itemEntry) reviewRefs.push(makeLink(itemEntry.sys.id));
        }
    }

    const fields = {
        blockId: { [LOCALE]: blockId },
        blockName: { [LOCALE]: blockData.blockName || heading || "Reviews" }
    };
    if (titleEntry) fields.sectionTitle = { [LOCALE]: makeLink(titleEntry.sys.id) };
    if (blockData.body250) fields.description = { [LOCALE]: blockData.body250 };
    if (reviewRefs.length) fields.addReviews = { [LOCALE]: reviewRefs };

    return await upsertEntry(env, CONTENT_TYPE, `reviews-${blockId}`, fields);
}
