import { LOCALE, getOrCreateSeo, safeId, publishPage } from "./pageHandler.js";
import { upsertEntry, makeLink } from "../utils/contentfulHelpers.js";
import { COMPONENTS } from "../registry.js";
import { genericComponentHandler } from "./genericComponent.js";
import { getOrderedKeys } from "../utils/jsonOrder.js";
import { convertHtmlToRichText } from "../utils/richText.js";

/**
 * ID mapping for Professional Services Taxonomy (Craft ID -> Contentful Concept ID)
 */
const PS_TAXONOMY_MAP = {
    "947469": "products",
    "989366": "services",
    "971413": "privilegeManagement",
    "947534": "privilegedRemoteAccess",
    "971414": "remoteSupport",
    "971412": "passwordSafe",
    "971415": "activeDirectoryBridge",
    "2071294": "identitySecurityInsights",
    "2071293": "entitle",
    "989367": "implementation",
    "989368": "upgradeMigration",
    "989369": "healthCheck"
};


/**
 * Main function to migrate S&T Services entries
 */
export async function migrateStServices(
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
    console.log(`\n📄 Starting S&T Services Migration (${data.length} entries)...`);

    for (let i = 0; i < data.length; i++) {
        const item = data[i];
        const pageNum = targetIndices ? targetIndices[i] + 1 : i + 1;
        const progress = `[${pageNum} / ${total}]`;
        const shouldPublish = item.status === "live";

        console.log(`\n➡️ ${progress} S&T Services: ${item.title} (ID: ${item.id})`);

        try {
            // 1. Process Rich Text and Basic Fields
            const introBodyHtml = item.bodyRedactorRestricted || "";
            const introBody = introBodyHtml ? await convertHtmlToRichText(env, introBodyHtml) : null;
            
            // 2. Create SEO
            const seoEntry = await getOrCreateSeo(env, item, assetMap);

            // 3. Resolve Company Quotes
            const companyQuotesLinks = [];
            if (item.companyQuotes && Array.isArray(item.companyQuotes)) {
                for (const quoteId of item.companyQuotes) {
                    try {
                        const quoteEntries = await env.getEntries({
                            content_type: "quoteItem",
                            "fields.entryId": String(quoteId),
                            limit: 1
                        });
                        if (quoteEntries.items.length > 0) {
                            companyQuotesLinks.push(makeLink(quoteEntries.items[0].sys.id));
                        }
                    } catch (err) {
                        console.warn(`   ⚠️ Could not resolve quote (ID: ${quoteId})`);
                    }
                }
            }

            // 4. Process Components (Sections)
            const sectionEntries = [];
            
            const getPageSegment = (itemId) => {
                if (!rawFileContent) return "";
                const pIdIdx = rawFileContent.indexOf(`"id": ${itemId}`);
                if (pIdIdx === -1) return "";
                const nextPIdx = rawFileContent.indexOf('"id":', pIdIdx + 10);
                return rawFileContent.substring(pIdIdx, nextPIdx === -1 ? undefined : nextPIdx);
            };
            const pageSegment = getPageSegment(item.id);

            // Detect component fields (slimBanner and servicesSideNavContent merge into sections)
            const componentFields = ['slimBanner', 'servicesSideNavContent'];

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
                            if (Array.isArray(entry)) {
                                sectionEntries.push(...entry.map(e => makeLink(e.sys.id)));
                            } else {
                                sectionEntries.push(makeLink(entry.sys.id));
                            }
                        }
                    } catch (err) {
                        console.error(`   🛑 Error processing block ${blockType} (${blockId}):`, err.message);
                    }
                }
            }

            // 5. Create Page Settings (pageSettingsSt)
            let pageSettingsLink = null;
            if (env) {
                const settingsId = safeId("settings-st", item.uri || item.slug);
                const settingsFields = {
                    pageSetting: { [LOCALE]: `Settings: ${item.title}` },
                    paragraphFontSize: { [LOCALE]: item.paragraphFontSize || "13px" }
                };
                if (seoEntry) {
                    settingsFields.seo = { [LOCALE]: makeLink(seoEntry.sys.id) };
                }
                
                if (item.parentId) {
                    try {
                        const parentEntries = await env.getEntries({
                            "fields.entryId": String(item.parentId),
                            limit: 1
                        });
                        if (parentEntries.items.length > 0) {
                            settingsFields.parentPage = { [LOCALE]: makeLink(parentEntries.items[0].sys.id) };
                        }
                    } catch (err) {
                        console.warn(`   ⚠️ Could not resolve parent page for settings (ID: ${item.parentId})`);
                    }
                }

                const settingsEntry = await upsertEntry(
                    env,
                    "pageSettingsSt",
                    settingsId,
                    settingsFields,
                    true
                );
                if (settingsEntry) {
                    pageSettingsLink = makeLink(settingsEntry.sys.id);
                }
            }

            // 6. Create Main page (newStServices)
            const mainFields = {
                entryId: { [LOCALE]: String(item.id) },
                title: { [LOCALE]: item.title || "" },
                slug: { [LOCALE]: item.uri || item.slug || "" },
                shortDescription: { [LOCALE]: item.body200 || "" },
                introHeading: { [LOCALE]: item.headingSection || "" },
                paragraphFontSize: { [LOCALE]: item.paragraphFontSize || "13px" }
            };

            if (introBody) {
                mainFields.introBody = { [LOCALE]: introBody };
            }
            if (pageSettingsLink) {
                mainFields.pageSettings = { [LOCALE]: pageSettingsLink };
            }
            if (sectionEntries.length > 0) {
                mainFields.sections = { [LOCALE]: sectionEntries };
            }
            if (companyQuotesLinks.length > 0) {
                mainFields.companyQuotes = { [LOCALE]: companyQuotesLinks };
            }

            // 7. Taxonomy Concepts
            const metadata = { concepts: [], tags: [] };
            if (item.professionalServicesCategories && Array.isArray(item.professionalServicesCategories)) {
                for (const catId of item.professionalServicesCategories) {
                    const conceptId = PS_TAXONOMY_MAP[String(catId)];
                    if (conceptId) {
                        metadata.concepts.push({
                            sys: { type: "Link", linkType: "TaxonomyConcept", id: conceptId }
                        });
                    } else {
                        console.warn(`   ⚠️ No taxonomy mapping for category ID: ${catId}`);
                    }
                }
            }

            const mainEntry = await upsertEntry(
                env,
                "newStServices",
                `st-sv-${item.id}`,
                mainFields,
                shouldPublish,
                metadata.concepts.length > 0 ? metadata : null
            );

            if (mainEntry && shouldPublish) {
                await publishPage(env, mainEntry, item);
            }

            console.log(`✅ S&T Services "${item.title}" migrated.`);

        } catch (err) {
            console.error(`❌ Error migrating S&T Services "${item.title}":`, err.message);
        }
    }
}
