import { LOCALE, getOrCreateSeo, safeId, publishPage } from "./pageHandler.js";
import { upsertEntry, makeLink } from "../utils/contentfulHelpers.js";
import { COMPONENTS } from "../registry.js";
import { genericComponentHandler } from "./genericComponent.js";
import { getOrderedKeys } from "../utils/jsonOrder.js";
import { convertHtmlToRichText } from "../utils/richText.js";

/**
 * Main function to migrate S&T entries
 */
export async function migrateSt(
    env,
    data,
    assetMap = null,
    targetIndices = null,
    totalPages = null,
    summary = null,
    rawFileContent = null
) {
    const total = targetIndices
        ? targetIndices[targetIndices.length - 1] + 1
        : totalPages || data.length;
    console.log(`\n📄 Starting S&T Migration (${data.length} entries)...`);

    for (let i = 0; i < data.length; i++) {
        const item = data[i];
        const pageNum = targetIndices ? targetIndices[i] + 1 : i + 1;
        const progress = `[${pageNum} / ${total}]`;
        const shouldPublish = item.status === "live";

        console.log(`\n➡️ ${progress} S&T: ${item.title} (ID: ${item.id})`);

        try {
            // 1. Process Text Fields directly
            // Not used in newSt schema, but we keep the processing logic if needed for internal use
            const introBodyHtml = item.bodyRedactorRestricted || "";
            const introBody = introBodyHtml ? await convertHtmlToRichText(env, introBodyHtml) : null;

            // 2. Create SEO
            const seoEntry = await getOrCreateSeo(env, item, assetMap);

            // 3. Resolve Parent Page
            let parentPageLink = null;
            if (item.parentId && env) {
                try {
                    const parentEntries = await env.getEntries({
                        content_type: "newSt",
                        "fields.entryId": String(item.parentId),
                        limit: 1
                    });
                    if (parentEntries.items.length > 0) {
                        parentPageLink = makeLink(parentEntries.items[0].sys.id);
                    }
                } catch (err) {
                    console.warn(`   ⚠️ Could not resolve parent page (ID: ${item.parentId})`);
                }
            }

            // 4. Process Components (Sections)
            const sectionEntries = [];
            let sectionNavigationEntry = null;
            let overwriteParentCtaEntry = null;

            const getPageSegment = (itemId) => {
                if (!rawFileContent) return "";
                const pIdIdx = rawFileContent.indexOf(`"id": ${itemId}`);
                if (pIdIdx === -1) return "";
                const nextPIdx = rawFileContent.indexOf('"id":', pIdIdx + 10);
                return rawFileContent.substring(pIdIdx, nextPIdx === -1 ? undefined : nextPIdx);
            };
            const pageSegment = getPageSegment(item.id);

            // Detect component fields
            const componentFields = ['bannerMediaRight', 'bannerMediaCenter', 'bannerSlim', 'sectionNavigation', 'servicesOverviewContent', 'overwriteParentCta'];

            for (const fieldKey of componentFields) {
                const components = item[fieldKey];
                if (!components || typeof components !== 'object') continue;

                const fIdx = pageSegment.indexOf(`"${fieldKey}":`);
                const fieldSegment = fIdx !== -1 ? pageSegment.substring(fIdx) : pageSegment;
                const orderedIds = getOrderedKeys(fieldSegment, components);

                for (const blockId of orderedIds) {
                    const block = components[blockId];
                    if (!block.enabled) continue;

                    const blockType = block.type || fieldKey;
                    const isSecNav = ["siteSection", "sectionNavigation"].includes(blockType) || fieldKey === "sectionNavigation";
                    const isOverwriteCta = blockType === "overwriteParentCta" || fieldKey === "overwriteParentCta";

                    const bIdx = fieldSegment.indexOf(`"${blockId}":`);
                    const nextBId = orderedIds[orderedIds.indexOf(blockId) + 1];
                    const nextBIdx = nextBId ? fieldSegment.indexOf(`"${nextBId}":`) : fieldSegment.length;
                    const blockSegment = fieldSegment.substring(bIdx, nextBIdx);

                    const fields = block.fields || {};
                    const config = COMPONENTS[blockType] || COMPONENTS[fieldKey];

                    if (!config) {
                        console.warn(`   ℹ️ skipping block: "${blockType}" (no mapping)`);
                        continue;
                    }

                    console.log(`   ✅ Detected "${blockType}" (ID: ${blockId})`);

                    try {
                        let entry;
                        if (config.handler === genericComponentHandler) {
                            const entryId = await genericComponentHandler(
                                env,
                                { id: blockId, ...fields, blockId: blockId },
                                config.mapping,
                                assetMap,
                                summary
                            );
                            if (entryId && env) {
                                entry = await env.getEntry(entryId);
                            } else if (entryId) {
                                entry = { sys: { id: entryId } };
                            }
                        } else {
                            entry = await config.handler(
                                env,
                                {
                                    blockId,
                                    blockSegment,
                                    ...fields,
                                    heading: fields.headingSection || fields.heading || "",
                                    body: fields.body || fields.bodyRedactorRestricted || "",
                                    label: fields.label || fields.ctaLinkText || "",
                                    variation: blockType
                                },
                                assetMap,
                                summary
                            );
                        }

                        if (entry) {
                            if (isSecNav) {
                                sectionNavigationEntry = entry;
                            } else if (isOverwriteCta) {
                                overwriteParentCtaEntry = entry;
                            } else {
                                // standard sections
                                if (Array.isArray(entry)) {
                                    sectionEntries.push(...entry.map(e => makeLink(e.sys.id)));
                                } else {
                                    sectionEntries.push(makeLink(entry.sys.id));
                                }
                            }
                        }
                    } catch (err) {
                        console.error(`   🛑 Error processing block ${blockType} (${blockId}):`, err.message);
                    }
                }
            }

            // 5. Create Main page (newSt)
            const mainFields = {
                entryId: { [LOCALE]: String(item.id) },
                title: { [LOCALE]: item.title || "" },
                slug: { [LOCALE]: item.uri || item.slug || "" }
            };

            // Mapped according to the confirmed schema
            if (parentPageLink) {
                mainFields.parentPage = { [LOCALE]: parentPageLink };
            }
            if (seoEntry) {
                mainFields.seo = { [LOCALE]: makeLink(seoEntry.sys.id) };
            }
            if (sectionNavigationEntry) {
                mainFields.sectionNavigation = { [LOCALE]: makeLink(Array.isArray(sectionNavigationEntry) ? sectionNavigationEntry[0].sys.id : sectionNavigationEntry.sys.id) };
            }
            if (overwriteParentCtaEntry) {
                mainFields.overwriteParentCta = { [LOCALE]: makeLink(Array.isArray(overwriteParentCtaEntry) ? overwriteParentCtaEntry[0].sys.id : overwriteParentCtaEntry.sys.id) };
            }
            if (sectionEntries.length > 0) {
                mainFields.sections = { [LOCALE]: sectionEntries };
            }

            const mainEntry = await upsertEntry(
                env,
                "newSt",
                `st-${item.id}`,
                mainFields,
                shouldPublish
            );

            if (mainEntry && shouldPublish) {
                await publishPage(env, mainEntry, item);
            }

            console.log(`✅ S&T "${item.title}" migrated.`);

        } catch (err) {
            console.error(`❌ Error migrating S&T "${item.title}":`, err.message);
        }
    }
}
