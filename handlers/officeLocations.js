/**
 * Handler: officeLocations → officeLocations
 * Craft: headingSection, body250, phoneNumber, globalOfficeLocations
 * Contentful: officeLocations { blockId, blockName, sectionTitle, description, gPhoneNumber, gCustomLinkText, addOfficeLocations: [globalOfficeLocations] }
 */
import { upsertEntry, upsertSectionTitle, makeLink, parseCraftLink } from "../utils/contentfulHelpers.js";

const LOCALE = "en-US";
const CONTENT_TYPE = "officeLocations";
const ITEM_CONTENT_TYPE = "globalOfficeLocations";

export async function createOrUpdateOfficeLocations(env, blockData, assetMap = null) {
    try {
        await env.getContentType(CONTENT_TYPE);
    } catch (err) {
        console.warn(`   ⚠ Content type "${CONTENT_TYPE}" not found: ${err.message}. Skipping.`);
        return null;
    }

    const blockId = blockData.blockId || "";
    const fields = blockData.fields || blockData;

    // 1. Section Title
    let titleEntry = null;
    if (fields.headingSection || fields.heading) {
        titleEntry = await upsertSectionTitle(env, blockId, fields.headingSection || fields.heading);
    }

    // 2. Global Phone Number (from main block)
    let gPhoneUrl = "";
    let gPhoneLabel = "";
    if (fields.phoneNumber) {
        const linkInfo = parseCraftLink(fields.phoneNumber);
        gPhoneUrl = linkInfo.url;
        gPhoneLabel = linkInfo.label;
    }

    // 3. Process Office Location Items
    const itemRefs = [];
    const officeData = fields.globalOfficeLocations || {};

    for (const [fId, office] of Object.entries(officeData)) {
        if (typeof office !== "object" || !office.fields) continue;
        const f = office.fields;

        const itemFields = {
            officeLocationName: { [LOCALE]: f.officeLocationName || "" },
            streetAddress: { [LOCALE]: f.officeStreetAddress || "" }
        };

        // Handle Map Link
        if (f.officeGoogleMapLink) {
            const mapLink = parseCraftLink(f.officeGoogleMapLink);
            itemFields.googleMapLink = { [LOCALE]: mapLink.url || "" };
            itemFields.mapCustomLinkText = { [LOCALE]: mapLink.label || "" };
        }

        // Handle Phone Link
        if (f.officePhoneNumber) {
            const phoneLink = parseCraftLink(f.officePhoneNumber);
            itemFields.phoneNumber = { [LOCALE]: phoneLink.url || "" };
            itemFields.phoneCustomLinkText = { [LOCALE]: phoneLink.label || "" };
        }

        // Handle Photo
        if (f.officeLocationPhoto?.length && assetMap) {
            const craftAssetId = String(f.officeLocationPhoto[0]);
            const assetInfo = assetMap.get(craftAssetId);
            if (assetInfo && assetInfo.id) {
                // Check if the asset actually exists in Contentful before linking
                let exists = false;
                try {
                    await env.getAsset(assetInfo.id);
                    exists = true;
                } catch (e) { }

                if (exists) {
                    itemFields.officeLocationPhoto = { [LOCALE]: { sys: { type: "Link", linkType: "Asset", id: assetInfo.id } } };
                } else {
                    console.warn(`   ⚠ Asset ${assetInfo.id} (Craft: ${craftAssetId}) not found in Contentful. Skipping link in office location.`);
                }
            }
        }

        const itemEntry = await upsertEntry(env, ITEM_CONTENT_TYPE, `officeitem-${fId}`, itemFields);
        if (itemEntry) {
            itemRefs.push(makeLink(itemEntry.sys.id));
        }
    }

    const cfFields = {
        blockId: { [LOCALE]: String(blockId) },
        blockName: { [LOCALE]: blockData.blockName || fields.headingSection || "Office Locations" },
        description: { [LOCALE]: fields.body250 || "" },
        gPhoneNumber: { [LOCALE]: gPhoneUrl },
        gCustomLinkText: { [LOCALE]: gPhoneLabel }
    };

    if (titleEntry) cfFields.sectionTitle = { [LOCALE]: makeLink(titleEntry.sys.id) };
    if (itemRefs.length) cfFields.addOfficeLocations = { [LOCALE]: itemRefs };

    return await upsertEntry(env, CONTENT_TYPE, `office-locations-${blockId}`, cfFields);
}
