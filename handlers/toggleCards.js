import { upsertEntry, makeLink } from "../utils/contentfulHelpers.js";

const LOCALE = "en-US";

const ALL_ST_ENTRIES_MAP = {
    "beyondtrustUniversity": "All BeyondTrust University",
    "professionalServices": "All Professional Services",
    "tamServices": "All TAM"
};

/**
 * Handler for toggleCards component
 */
export async function createOrUpdateToggleCards(env, blockData, assetMap = null, summary = null) {
    // Fields are spread into blockData in newSt.js handler
    const { blockId, allSTEntries, selectIndividualEntries, blockName, variation } = blockData;

    // 1. Map allStEntries
    const allStValue = allSTEntries ? ALL_ST_ENTRIES_MAP[allSTEntries] : null;

    // 2. Resolve individual entries
    const individualRefs = [];
    if (selectIndividualEntries && typeof selectIndividualEntries === 'object') {
        const innerBlocks = Object.values(selectIndividualEntries);
        for (const innerBlock of innerBlocks) {
            if (innerBlock.fields && Array.isArray(innerBlock.fields.selectedEntries)) {
                for (const entryId of innerBlock.fields.selectedEntries) {
                    if (!entryId) continue;

                    // Search for newStBtu with this entryId
                    if (env) {
                        try {
                            const entries = await env.getEntries({
                                content_type: "newStBtu",
                                "fields.entryId": String(entryId),
                                limit: 1
                            });
                            if (entries.items.length > 0) {
                                individualRefs.push(makeLink(entries.items[0].sys.id));
                            } else {
                                console.warn(`   ⚠️ toggleCards ${blockId}: newStBtu with entryId ${entryId} not found in Contentful.`);
                            }
                        } catch (err) {
                            console.warn(`   ⚠️ toggleCards ${blockId}: Error searching for entryId ${entryId}: ${err.message}`);
                        }
                    } else {
                        // Dry run mock
                        individualRefs.push(makeLink(`dry-stbu-${entryId}`));
                    }
                }
            }
        }
    }

    // 3. Upsert toggleCards
    const cfFields = {
        blockId: { [LOCALE]: String(blockId) },
        blockName: { [LOCALE]: blockName || variation || "Toggle Cards" }
    };

    if (allStValue) {
        cfFields.allStEntries = { [LOCALE]: allStValue };
    }

    if (individualRefs.length > 0) {
        cfFields.selectIndividualEntries = { [LOCALE]: individualRefs };
    }

    return await upsertEntry(env, "toggleCards", `tc-${blockId}`, cfFields);
}
