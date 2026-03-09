import fs from "fs";
import {
    upsertEntry,
    makeLink,
    resolveInternalUrl,
    upsertAssetWrapper,
    upsertCta,
    upsertSectionTitle,
    parseCraftLink
} from "../utils/contentfulHelpers.js";
import { getOrderedKeys } from "../utils/jsonOrder.js";
import { COMPONENTS } from "../registry.js";
import { genericComponentHandler } from "./genericComponent.js";
import { convertHtmlToRichText } from "../utils/richText.js";

const LOCALE = "en-US";
const CONTENT_TYPE = "newPressMediaCpt";

/**
 * Mapping for typeId to entryType
 */
const ENTRY_TYPE_MAP = {
    "147": "Press Release",  // pressRelease
    "148": "Listing",        // pressListing
    "149": "Media Coverage", // mediaCoverage
    "150": "Media Assets",   // mediaAssets
};

/**
 * Specific migration handler for Press & Media content
 */
export async function migratePressMedia(env, data, assetMap, targetIndices, totalPages, summary, rawFileContent) {
    console.log(`\n🚀 Migrating ${data.length} Press & Media entries...`);

    for (let i = 0; i < data.length; i++) {
        const item = data[i];
        const pageNum = targetIndices[i] + 1;
        console.log(`\n➡️ [${pageNum} / ${totalPages}] Press Item: ${item.title} (ID: ${item.id})`);

        if (!env) {
            console.log(`   [DRY RUN] Would migrate Press Item: ${item.title}`);
            continue;
        }

        const entryId = `press-${item.id}`;

        // 1. Map entryType
        const entryType = ENTRY_TYPE_MAP[String(item.typeId)] || "Press Release";

        // 2. Map mediaContact (sourcePerson)
        let mediaContactLink = null;
        if (item.sourcePerson && item.sourcePerson.length > 0) {
            const personId = String(item.sourcePerson[0]);
            try {
                const personEntries = await env.getEntries({
                    content_type: "peopleCpt",
                    "fields.entryId": personId,
                    limit: 1
                });
                if (personEntries.items.length > 0) {
                    mediaContactLink = makeLink(personEntries.items[0].sys.id);
                } else {
                    console.warn(`   ⚠️ Person ID ${personId} not found in Contentful for mediaContact`);
                }
            } catch (err) {
                console.warn(`   ⚠️ Error looking up person ${personId}: ${err.message}`);
            }
        }

        // 3. Map mediaLogo (companyLogo)
        let mediaLogoLink = null;
        if (item.companyLogo && item.companyLogo.length > 0 && assetMap) {
            const assetId = String(item.companyLogo[0]);
            const assetInfo = assetMap.get(assetId);
            if (assetInfo) {
                const wrapper = await upsertAssetWrapper(env, assetId, assetInfo.id, assetInfo.mimeType, assetInfo.wistiaUrl);
                if (wrapper) {
                    mediaLogoLink = makeLink(wrapper.sys.id);
                }
            }
        }

        // 4. Process Components (mainBannerPress + detailsContentPress + sideNavContentPress)
        const contentComponents = [];

        const processMatrix = async (fieldName) => {
            const matrix = item[fieldName];
            if (!matrix || typeof matrix !== 'object' || Object.keys(matrix).length === 0) return;

            // Find segment in raw file for ordering
            const pIdx = rawFileContent.indexOf(`"id": ${item.id}`);
            if (pIdx === -1) return;
            const fIdx = rawFileContent.indexOf(`"${fieldName}":`, pIdx);
            if (fIdx === -1) return;
            const nextPIdx = rawFileContent.indexOf('"id":', fIdx + 20);
            const fieldSegment = rawFileContent.substring(fIdx, nextPIdx === -1 ? undefined : nextPIdx);

            const orderedIds = getOrderedKeys(fieldSegment, matrix);

            for (const blockId of orderedIds) {
                const block = matrix[blockId];
                if (!block.enabled) continue;

                let bType = block.type;

                // Special mapping logic for Matrix fields in Press Template
                if (fieldName === "mainBannerPress" && (bType === "bannerSlim" || bType === "bannerHero")) {
                    bType = "mainBannerPress";
                }

                const config = COMPONENTS[bType] ||
                    (bType === "mainBannerPress" ? { handler: createOrUpdatePressBanner } : null) ||
                    (bType === "assetGrid" ? { handler: createOrUpdateAssetGrid } : null);

                if (config) {
                    console.log(`   ✅ Processing ${bType} (${blockId}) for field "${fieldName}"`);
                    let componentEntry;

                    const handlerData = {
                        blockId,
                        blockSegment: "",
                        ...block.fields,
                        heading: block.fields.headingSection || block.fields.heading || item.title,
                        body: block.fields.body180 || block.fields.bodyRedactorRestricted || block.fields.description || "",
                        variation: block.type
                    };

                    // Handle nested assetGrid in Craft
                    if (bType === "assetGrid" && block.fields.assetGrid) {
                        handlerData.innerGrid = block.fields.assetGrid;
                        const innerFIdx = rawFileContent.indexOf(`"assetGrid":`, fIdx);
                        handlerData.innerSegment = rawFileContent.substring(innerFIdx, nextPIdx === -1 ? undefined : nextPIdx);
                    }

                    if (config.handler === genericComponentHandler) {
                        const cfId = await genericComponentHandler(env, handlerData, config.mapping, assetMap, summary);
                        if (cfId) componentEntry = await env.getEntry(cfId);
                    } else {
                        componentEntry = await config.handler(env, handlerData, assetMap, summary);
                    }

                    if (componentEntry) {
                        if (Array.isArray(componentEntry)) {
                            contentComponents.push(...componentEntry.map(e => makeLink(e.sys.id)));
                        } else {
                            contentComponents.push(makeLink(componentEntry.sys.id));
                        }
                    }
                } else if (bType !== "contentSummary" && bType !== "biographies" && bType !== "biography") {
                    console.warn(`   ⚠️ No component mapping for block type "${bType}" found in ${fieldName}`);
                    if (!summary.missingMappings.has(bType)) {
                        summary.missingMappings.set(bType, Object.keys(block.fields || {}));
                    }
                }
            }
        };

        await processMatrix("mainBannerPress");
        await processMatrix("detailsContentPress");
        await processMatrix("sideNavContentPress");

        // 5. Section Navigation
        let sectionNavigationLink = null;
        if (item.sectionNavigation && item.sectionNavigation.length > 0) {
            const navId = String(item.sectionNavigation[0]);
            try {
                const navEntries = await env.getEntries({
                    content_type: "sectionNavigation",
                    "fields.blockId": navId,
                    limit: 1
                });
                if (navEntries.items.length > 0) {
                    sectionNavigationLink = makeLink(navEntries.items[0].sys.id);
                }
            } catch (err) {
                console.warn(`   ⚠️ Error looking up sectionNavigation ${navId}: ${err.message}`);
            }
        }

        // 6. Build fields for main entry
        const cfFields = {
            entryId: { [LOCALE]: String(item.id) },
            title: { [LOCALE]: item.title },
            slug: { [LOCALE]: item.slug },
            entryType: { [LOCALE]: entryType },
            abstract: { [LOCALE]: item.abstract || "" },
            addFeaturedToListing: { [LOCALE]: !!item.switch },
        };

        if (mediaContactLink) cfFields.mediaContact = { [LOCALE]: mediaContactLink };
        if (mediaLogoLink) cfFields.mediaLogo = { [LOCALE]: mediaLogoLink };
        if (contentComponents.length > 0) cfFields.contentComponents = { [LOCALE]: contentComponents };
        if (sectionNavigationLink) cfFields.sectionNavigation = { [LOCALE]: sectionNavigationLink };

        // 7. Upsert/Publish Press & Media Entry
        try {
            await upsertEntry(env, CONTENT_TYPE, entryId, cfFields);
            summary.created++;
        } catch (err) {
            console.error(`   🛑 Error upserting Press entry ${item.id}:`, err.message);
            summary.skipped.push({ page: item.title, type: CONTENT_TYPE, error: err.message });
        }
    }
}

/**
 * Specific handler for mainBannerPress content type
 */
export async function createOrUpdatePressBanner(env, bannerData, assetMap = null) {
    const CT = "mainBannerPress";
    if (!env) return { sys: { id: `banner-${bannerData.blockId}` } };

    const fields = {
        blockId: { [LOCALE]: String(bannerData.blockId) },
        blockName: { [LOCALE]: bannerData.heading || "Press Banner" },
        heading: { [LOCALE]: bannerData.heading || "" },
        description: { [LOCALE]: String(bannerData.body || "") },
        bannerOption: { [LOCALE]: bannerData.variation === "bannerSlim" ? "Banner Slim" : "Banner Media Right" },
        stackHeadingAndBody: { [LOCALE]: !!bannerData.switch }
    };

    // Handle CTA if present
    if (bannerData.ctaLink) {
        const linkInfo = parseCraftLink(bannerData.ctaLink);
        const label = bannerData.label || linkInfo.label || "Learn More";
        const ctaEntry = await upsertCta(env, bannerData.blockId, label, linkInfo.url, true, linkInfo.linkedId);
        if (ctaEntry) {
            fields.cta = { [LOCALE]: makeLink(ctaEntry.sys.id) };
        }
    }

    return await upsertEntry(env, CT, `banner-${bannerData.blockId}`, fields);
}

/**
 * Handler for assetGrid
 * Processes both top-level asset containers and nested asset arrays
 */
export async function createOrUpdateAssetGrid(env, gridData, assetMap, summary) {
    const CT = "assetGrid";
    if (!env) return { sys: { id: `grid-${gridData.blockId}` } };

    const results = [];

    // Check if we have an inner matrix of grids (common in sideNavContentPress)
    if (gridData.innerGrid) {
        const innerIds = getOrderedKeys(gridData.innerSegment || "", gridData.innerGrid);
        for (const subId of innerIds) {
            const subData = gridData.innerGrid[subId];
            if (!subData.enabled) continue;

            const subResults = await createOrUpdateAssetGrid(env, {
                blockId: subId,
                ...subData.fields,
                heading: gridData.headingSection || gridData.heading
            }, assetMap, summary);

            if (Array.isArray(subResults)) results.push(...subResults);
            else if (subResults) results.push(subResults);
        }
        return results;
    }

    const assets = gridData.asset || [];
    for (let i = 0; i < assets.length; i++) {
        const craftAssetId = String(assets[i]);
        const assetInfo = assetMap.get(craftAssetId);

        if (assetInfo) {
            const wrapper = await upsertAssetWrapper(env, craftAssetId, assetInfo.id, assetInfo.mimeType, assetInfo.wistiaUrl);
            if (wrapper) {
                const fields = {
                    blockId: { [LOCALE]: `${gridData.blockId}-${i}` },
                    blockName: { [LOCALE]: `Asset ${i + 1} for ${gridData.heading || 'Grid'}` },
                    asset: { [LOCALE]: makeLink(wrapper.sys.id) }
                };

                if (gridData.heading && i === 0) {
                    const titleEntry = await upsertSectionTitle(env, gridData.blockId, gridData.heading);
                    if (titleEntry) fields.sectionTitle = { [LOCALE]: makeLink(titleEntry.sys.id) };
                }

                const entry = await upsertEntry(env, CT, `grid-${gridData.blockId}-${i}`, fields);
                if (entry) results.push(entry);
            }
        }
    }

    return results;
}
