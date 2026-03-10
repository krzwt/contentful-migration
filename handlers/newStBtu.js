import { LOCALE, getOrCreateSeo, safeId, publishPage } from "./pageHandler.js";
import { upsertEntry, makeLink, resolveEntryRef } from "../utils/contentfulHelpers.js";
import { COMPONENTS } from "../registry.js";
import { genericComponentHandler } from "./genericComponent.js";
import { getOrderedKeys } from "../utils/jsonOrder.js";
import { convertHtmlToRichText } from "../utils/richText.js";

/**
 * Main function to migrate S&T BTU entries
 */
export async function migrateStBtu(
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
    console.log(`\n📄 Starting S&T BTU Migration (${data.length} entries)...`);

    for (let i = 0; i < data.length; i++) {
        const item = data[i];
        const pageNum = targetIndices ? targetIndices[i] + 1 : i + 1;
        const progress = `[${pageNum} / ${total}]`;
        const shouldPublish = item.status === "live";

        console.log(`\n➡️ ${progress} S&T BTU: ${item.title} (ID: ${item.id})`);

        try {
            // 1. Process Text Fields directly
            const shortDescription = item.body200 || "";
            const introHeading = item.headingSection || item.title || "";
            const introBodyHtml = item.bodyRedactorRestricted || "";
            const introBody = introBodyHtml ? await convertHtmlToRichText(env, introBodyHtml) : null;

            // 2. Create SEO
            const seoEntry = await getOrCreateSeo(env, item, assetMap);

            // 3. Create pageSettingsSt entry
            const settingsId = safeId("settings-st", item.uri || item.slug);
            const settingsFields = {
                pageSetting: { [LOCALE]: `Settings: ${item.title}` }
            };
            if (seoEntry) settingsFields.seo = { [LOCALE]: makeLink(seoEntry.sys.id) };

            // Resolve parent page if available in sectionNavigationParent
            if (item.sectionNavigationParent && Array.isArray(item.sectionNavigationParent) && item.sectionNavigationParent.length > 0) {
                const parentId = item.sectionNavigationParent[0];
                const parentRef = resolveEntryRef(parentId);
                if (parentRef) {
                    console.log(`   🔗 Linking parent page: ${parentId} -> ${parentRef.id} (${parentRef.type})`);
                    settingsFields.parentPage = { [LOCALE]: makeLink(parentRef.id) };
                } else {
                    console.warn(`   ⚠️ Parent page ID ${parentId} not found in cache.`);
                }
            }

            const settingsEntry = await upsertEntry(
                env,
                "pageSettingsSt",
                settingsId,
                settingsFields,
                shouldPublish
            );

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

            // Detect component fields (slimBanner, servicesSideNavContent)
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

                    const bIdx = fieldSegment.indexOf(`"${blockId}":`);
                    const nextBId = orderedIds[orderedIds.indexOf(blockId) + 1];
                    const nextBIdx = nextBId ? fieldSegment.indexOf(`"${nextBId}":`) : fieldSegment.length;
                    const blockSegment = fieldSegment.substring(bIdx, nextBIdx);

                    const type = block.type || fieldKey;
                    const fields = block.fields || {};
                    const config = COMPONENTS[type];

                    if (!config) {
                        console.warn(`   ℹ️ skipping block: "${type}" (no mapping)`);
                        continue;
                    }

                    console.log(`   ✅ Detected "${type}" (ID: ${blockId})`);

                    try {
                        let entry;
                        if (config.handler === genericComponentHandler) {
                            const entryId = await genericComponentHandler(
                                env,
                                { id: blockId, ...fields },
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
                                    variation: type
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
                        console.error(`   🛑 Error processing block ${type} (${blockId}):`, err.message);
                    }
                }
            }

            // Process Company Quotes
            const quoteReferences = [];
            if (item.companyQuotes && Array.isArray(item.companyQuotes)) {
                for (const qId of item.companyQuotes) {
                    if (!qId || !env) {
                        if (!env && qId) quoteReferences.push(makeLink(`dry-run-quote-${qId}`));
                        continue;
                    }
                    try {
                        const qEntries = await env.getEntries({
                            content_type: "quoteItem",
                            "fields.entryId": String(qId),
                            limit: 1
                        });
                        if (qEntries.items.length > 0) {
                            quoteReferences.push(makeLink(qEntries.items[0].sys.id));
                        } else {
                            console.warn(`   ⚠ Quote with entryId ${qId} not found in Contentful.`);
                        }
                    } catch (err) {
                        console.warn(`   ⚠ Error finding quote ${qId}`);
                    }
                }
            }

            // 5. Create Main page (newStBtu)
            const mainFields = {
                entryId: { [LOCALE]: String(item.id) },
                title: { [LOCALE]: item.title || "" },
                slug: { [LOCALE]: item.uri || item.slug || "" },
                shortDescription: { [LOCALE]: shortDescription },
                introHeading: { [LOCALE]: introHeading },
                paragraphFontSize: { [LOCALE]: item.paragraphFontSize || "13px" }
            };
            if (introBody) mainFields.introBody = { [LOCALE]: introBody };
            if (settingsEntry) mainFields.pageSettings = { [LOCALE]: makeLink(settingsEntry.sys.id) };
            if (sectionEntries.length > 0) mainFields.sections = { [LOCALE]: sectionEntries };
            if (quoteReferences.length > 0) mainFields.companyQuotes = { [LOCALE]: quoteReferences };

            // -------------------------------------------------------
            // 3. Build Taxonomy Concepts metadata
            // -------------------------------------------------------
            const metadata = { concepts: [] };

            const conceptMapping = {
                "Product": "products",
                "Password Safe": "passwordSafe",
                "Privileged Remote Access": "privilegedRemoteAccess",
                "Remote Support": "remoteSupport",
                "Endpoint Privilege Management": "products",
                "Privilege Management": "products",
                "Active Directory Bridge": "activeDirectoryBridge",
                "Success Elevated": "successElevated",
                "Resource Type": "contentType",
                "Course Format": "courseFormat"
            };

            const VALID_CONCEPTS = new Set([
                "products", "passwordSafe", "privilegedRemoteAccess", "remoteSupport",
                "activeDirectoryBridge", "identitySecurityInsights", "successElevated",
                "courseFormat",
                "endpointPrivilegeManagementForUnixAndLinux", "endpointPrivilegeManagementForWindowsAndMac",
                "entitle", "contentType", "useCases", "industries",
                "managePasswordsSecretsSessions", "enforceLeastPrivilegeJitAccess",
                "improveIdentitySecurityPosture", "meetComplianceMandates",
                "secureAllAccessRemoteOtVendorEtc", "supportServiceDesksUsersDevicesDesktops"
            ]);

            if (item.courseCategories && item.courseCategories.length > 0) {
                const conceptsSet = new Set();

                for (const cat of item.courseCategories) {
                    let conceptId = null;
                    const title = typeof cat === 'object' ? cat.title : null;
                    const slug = typeof cat === 'object' ? cat.slug : null;

                    if (title && conceptMapping[title] !== undefined) {
                        conceptId = conceptMapping[title];
                    } else if (slug) {
                        const manualSlugMapping = {
                            "product": "products",
                            "password-safe": "passwordSafe",
                            "remote-support": "remoteSupport",
                            "privileged-remote-access": "privilegedRemoteAccess",
                            "privilege-management": "products",
                            "ad-bridge": "activeDirectoryBridge"
                        };

                        if (manualSlugMapping[slug]) {
                            conceptId = manualSlugMapping[slug];
                        } else {
                            // Try camelCase for sub-categories
                            const camId = slug.split("-").map((word, index) =>
                                index === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1)
                            ).join("");

                            if (VALID_CONCEPTS.has(camId)) {
                                conceptId = camId;
                            }
                        }
                    }

                    if (conceptId && VALID_CONCEPTS.has(conceptId)) {
                        conceptsSet.add(conceptId);
                    }
                }

                if (conceptsSet.size > 0) {
                    metadata.concepts = Array.from(conceptsSet).map(id => ({
                        sys: { type: "Link", linkType: "TaxonomyConcept", id }
                    }));
                    console.log(`   🏷️  Taxonomy Concepts: ${Array.from(conceptsSet).join(", ")}`);
                }
            }

            const mainEntry = await upsertEntry(
                env,
                "newStBtu",
                `stbtu-${item.id}`,
                mainFields,
                shouldPublish,
                metadata.concepts.length > 0 ? metadata : null
            );

            if (mainEntry && shouldPublish) {
                await publishPage(env, mainEntry, item);
            }

            console.log(`✅ S&T BTU "${item.title}" migrated.`);

        } catch (err) {
            console.error(`❌ Error migrating S&T BTU "${item.title}":`, err.message);
        }
    }
}
