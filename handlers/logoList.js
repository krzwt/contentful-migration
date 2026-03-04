/**
 * Handler: logoList → partnersLogosBlock
 * Craft: headingSection, logoList (nested groups with logo items), gridSize, logoBackground
 * Contentful: partnersLogosBlock { blockId, blockName, sectionTitle, logoList: [addPartnerLogo], gridSize, logoBackground }
 */
import { upsertEntry, upsertSectionTitle, makeLink, parseCraftLink, upsertCta, resolveInternalTitle } from "../utils/contentfulHelpers.js";
import { getOrderedKeys } from "../utils/jsonOrder.js";

const LOCALE = "en-US";
const CONTENT_TYPE = "partnersLogosBlock";

const BG_MAP = { grey: "Grey", transparent: "Transparent", Gray: "Grey" };

export async function createOrUpdateLogoList(env, blockData, assetMap = null) {
    try { await env.getContentType(CONTENT_TYPE); } catch (err) {
        console.warn(`   ⚠ Content type "${CONTENT_TYPE}" not found: ${err.message}. Skipping.`);
        return null;
    }

    const blockId = blockData.blockId;
    const heading = blockData.headingSection || "";

    const titleEntry = await upsertSectionTitle(env, blockId, heading);

    const logoRefs = [];
    const logoData = blockData.logoList || {};

    const orderedGIds = getOrderedKeys(blockData.blockSegment, logoData);
    for (const gId of orderedGIds) {
        const group = logoData[gId];
        if (typeof group !== "object" || !group.fields) continue;

        // Extract group segment
        const gIdx = blockData.blockSegment.indexOf(`"${gId}":`);
        const nextGId = orderedGIds[orderedGIds.indexOf(gId) + 1];
        const nextGIdx = nextGId ? blockData.blockSegment.indexOf(`"${nextGId}":`) : blockData.blockSegment.length;
        const groupSegment = blockData.blockSegment.substring(gIdx, nextGIdx);

        const logos = group.fields?.logos || {};
        const orderedLogoIds = getOrderedKeys(groupSegment, logos);

        for (const lId of orderedLogoIds) {
            const logo = logos[lId];
            if (typeof logo !== "object" || !logo.fields) continue;
            const f = logo.fields;

            const logoFields = {};

            if (f.logo?.length && assetMap) {
                const assetInfo = assetMap.get(String(f.logo[0]));
                if (assetInfo) {
                    logoFields.logo = { [LOCALE]: { sys: { type: "Link", linkType: "Asset", id: assetInfo.id } } };
                }
            }

            if (f.caption) logoFields.caption = { [LOCALE]: f.caption };

            if (f.logoLink) {
                let { url, label, linkedId } = parseCraftLink(f.logoLink);
                if (!label && linkedId) {
                    label = resolveInternalTitle(linkedId) || label;
                }
                if (url || label || linkedId) {
                    const ctaEntry = await upsertCta(env, lId, label, url, true, linkedId);
                    if (ctaEntry) logoFields.cta = { [LOCALE]: makeLink(ctaEntry.sys.id) };
                }
            }

            const logoEntry = await upsertEntry(env, "addPartnerLogo", `logo-${lId}`, logoFields);
            if (logoEntry) logoRefs.push(makeLink(logoEntry.sys.id));
        }
    }

    const fields = {
        blockId: { [LOCALE]: blockId },
        blockName: { [LOCALE]: blockData.blockName || heading || "Logo List" },
        gridSize: { [LOCALE]: blockData.gridSize ? parseInt(blockData.gridSize) : 4 },
        logoBackground: { [LOCALE]: BG_MAP[(blockData.logoBackground || "").toLowerCase()] || "Grey" }
    };
    if (titleEntry) fields.sectionTitle = { [LOCALE]: makeLink(titleEntry.sys.id) };
    if (logoRefs.length) fields.logoList = { [LOCALE]: logoRefs };

    return await upsertEntry(env, CONTENT_TYPE, `logos-${blockId}`, fields);
}
