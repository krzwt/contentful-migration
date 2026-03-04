/**
 * Handler: reviews → reviewsBlock
 * Craft: headingSection, body250, reviews (nested items with star, reviewDescription, author)
 * Contentful: reviewsBlock { blockId, blockName, sectionTitle, description, addReviews: [reviewItem], cta }
 */
import { upsertEntry, upsertSectionTitle, makeLink, parseCraftLink } from "../utils/contentfulHelpers.js";
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

                // Handle Image
                let imageLink = null;
                const assetId = Array.isArray(rf.image) && rf.image.length > 0 ? rf.image[0] : null;
                const assetInfo = assetId ? (assetMap && assetMap.get(String(assetId))) : null;
                if (assetInfo) {
                    imageLink = { sys: { type: "Link", linkType: "Asset", id: assetInfo.id } };
                }

                // Handle Labels
                const labelRefs = [];
                const labelsData = rf.labels || {};
                const labelIds = Object.keys(labelsData);
                for (const lId of labelIds) {
                    const lFields = labelsData[lId]?.fields || {};
                    if (lFields.label) {
                        const labelEntry = await upsertEntry(env, "reviewLabels", `label-${lId}`, {
                            label: { [LOCALE]: lFields.label }
                        });
                        if (labelEntry) labelRefs.push(makeLink(labelEntry.sys.id));
                    }
                }

                // Handle Link
                const linkData = parseCraftLink(rf.reviewLink || rf.reviewUrl);

                const itemFields = {
                    star: { [LOCALE]: parseInt(rf.star) || 5 },
                    review: { [LOCALE]: rf.reviewDescription || rf.body || "" },
                    author: { [LOCALE]: rf.author || "" }
                };
                if (imageLink) itemFields.image = { [LOCALE]: imageLink };
                if (labelRefs.length > 0) itemFields.labels = { [LOCALE]: labelRefs };
                if (linkData.url) itemFields.reviewUrl = { [LOCALE]: linkData.url };

                const itemEntry = await upsertEntry(env, "reviewItem", `review-${rowId}`, itemFields);
                if (itemEntry) reviewRefs.push(makeLink(itemEntry.sys.id));
            }
        } else {
            // Flat structure
            // Handle Image
            let imageLink = null;
            const assetId = Array.isArray(f.image) && f.image.length > 0 ? f.image[0] : null;
            const assetInfo = assetId ? (assetMap && assetMap.get(String(assetId))) : null;
            if (assetInfo) {
                imageLink = { sys: { type: "Link", linkType: "Asset", id: assetInfo.id } };
            }

            // Handle Labels
            const labelRefs = [];
            const labelsData = f.labels || {};
            const labelIds = Object.keys(labelsData);
            for (const lId of labelIds) {
                const lFields = labelsData[lId]?.fields || {};
                if (lFields.label) {
                    const labelEntry = await upsertEntry(env, "reviewLabels", `label-${lId}`, {
                        label: { [LOCALE]: lFields.label }
                    });
                    if (labelEntry) labelRefs.push(makeLink(labelEntry.sys.id));
                }
            }

            // Handle Link
            const linkData = parseCraftLink(f.reviewLink || f.reviewUrl);

            const itemFields = {
                star: { [LOCALE]: parseInt(f.star) || 5 },
                review: { [LOCALE]: f.reviewDescription || f.body || "" },
                author: { [LOCALE]: f.author || "" }
            };
            if (imageLink) itemFields.image = { [LOCALE]: imageLink };
            if (labelRefs.length > 0) itemFields.labels = { [LOCALE]: labelRefs };
            if (linkData.url) itemFields.reviewUrl = { [LOCALE]: linkData.url };

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
