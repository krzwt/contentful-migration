import { LOCALE, getOrCreateSeo, safeId } from "./pageHandler.js";
import { upsertEntry, makeLink } from "../utils/contentfulHelpers.js";
import { getCategoryName, getCategory } from "../utils/categoryLoader.js";
import { processTags, loadTagMapping } from "../utils/tagHandler.js";
import { COMPONENTS } from "../registry.js";
import { genericComponentHandler } from "./genericComponent.js";

/**
 * Main function to migrate Resource entries
 */
export async function migrateResources(env, resourceData, assetMap = null, targetIndices = null, totalPages = null) {
    const total = targetIndices ? targetIndices[targetIndices.length - 1] + 1 : (totalPages || resourceData.length);
    console.log(`\n📚 Starting Resource Migration (${resourceData.length} entries)...`);

    for (let i = 0; i < resourceData.length; i++) {
        const item = resourceData[i];
        const pageNum = targetIndices ? targetIndices[i] + 1 : i + 1;
        const progress = `[${pageNum} / ${total}]`;
        const shouldPublish = item.status === "live";

        const typeMap = {
            4: "Resources",
            22: "Infographics",
            24: "Whitepapers",
            25: "Datasheets",
            26: "Videos",
            27: "Competitor Comparisons",
            29: "Case Studies",
            23: "Webinars"
        };

        let typeLabel = typeMap[item.typeId] || "Resources";

        // Try to refine type from General Categories (Content Type group - parent 1836820)
        if (item.generalCategories) {
            for (const catId of item.generalCategories) {
                const cat = getCategory(catId);
                if (cat && cat.parentId === 1836820) {
                    typeLabel = cat.title;
                    break;
                }
            }
        }

        console.log(`\n➡️ ${progress} ${typeLabel}: ${item.title} (ID: ${item.id}, Status: ${item.status})`);

        // Log Categories for Taxonomy check
        if (item.generalCategories && item.generalCategories.length > 0) {
            const catNames = item.generalCategories.map(id => getCategoryName(id)).filter(Boolean);
            console.log(`   🏷️  Categories: ${catNames.join(", ")}`);
        }

        try {
            // 1. Create Webcast Info if it exists
            const webcastInfoIds = [];
            if (item.webcastInfo) {
                const tzMap = {
                    "ET": "Eastern (US & Canada)",
                    "CT": "Central (US & Canada)",
                    "MT": "Mountain (US & Canada",
                    "PT": "Pacific (US & Canada)",
                    "WET": "Western Europe",
                    "CET": "Central Europe",
                    "brasilia": "Brasilia",
                    "SGT": "Singapore",
                    "GST": "Gulf Standard Time",
                    "EET": "Eastern Europe"
                };

                for (const [blockId, webcastData] of Object.entries(item.webcastInfo)) {
                    if (webcastData.fields) {
                        const rawTz = webcastData.fields.webcastTimezone;
                        const mappedTz = tzMap[rawTz] || "Eastern (US & Canada)";

                        const webcastFields = {
                            webcastTimezone: { [LOCALE]: mappedTz }
                        };

                        if (webcastData.fields.webcastId) {
                            webcastFields.webcastId = { [LOCALE]: String(webcastData.fields.webcastId) };
                        } else {
                            webcastFields.webcastId = { [LOCALE]: null };
                        }
                        const webcastEntry = await upsertEntry(env, "webcastInfo", `webcast-${blockId}`, webcastFields, shouldPublish);
                        if (webcastEntry) webcastInfoIds.push(webcastEntry.sys.id);
                    }
                }
            }

            // 2. Create Resource Fields Component
            const resourceFields = {
                resourceTitle: { [LOCALE]: item.resourceTitle || item.title || "" },
                resourceDescription: { [LOCALE]: item.resourceDescription || "" },
                signup: { [LOCALE]: !!item.signupRequired },
                salesforceCampaignId: { [LOCALE]: item.salesforceCampaignId || "" },
                resourceTranscript: { [LOCALE]: item.resourceTranscript || "" },
                timeOverride: { [LOCALE]: item.timeOverride || "" }
            };

            // Handle Assets in Resource Fields
            if (item.resourceCardImage && item.resourceCardImage[0]) {
                const craftAssetId = String(item.resourceCardImage[0]);
                if (assetMap && assetMap.has(craftAssetId)) {
                    const contentfulAssetId = assetMap.get(craftAssetId).id;
                    resourceFields.resourceCardImage = { [LOCALE]: { sys: { type: "Link", linkType: "Asset", id: contentfulAssetId } } };
                } else {
                    console.warn(`   ⚠️ Asset ${craftAssetId} not found in map, skipping link for resourceCardImage.`);
                }
            }
            if ((item.resourceBannerImage && item.resourceBannerImage[0]) || (item.resourceBannerBackground && item.resourceBannerBackground[0])) {
                const craftAssetId = String(item.resourceBannerImage?.[0] || item.resourceBannerBackground?.[0]);
                if (assetMap && assetMap.has(craftAssetId)) {
                    const contentfulAssetId = assetMap.get(craftAssetId).id;
                    resourceFields.resourceBannerImage = { [LOCALE]: { sys: { type: "Link", linkType: "Asset", id: contentfulAssetId } } };
                } else {
                    console.warn(`   ⚠️ Asset ${craftAssetId} not found in map, skipping link for resourceBannerImage.`);
                }
            }
            if (item.resourceDocument && item.resourceDocument[0]) {
                const craftAssetId = String(item.resourceDocument[0]);
                if (assetMap && assetMap.has(craftAssetId)) {
                    const contentfulAssetId = assetMap.get(craftAssetId).id;
                    resourceFields.resourceDocument = { [LOCALE]: { sys: { type: "Link", linkType: "Asset", id: contentfulAssetId } } };
                } else {
                    console.warn(`   ⚠️ Asset ${craftAssetId} not found in map, skipping link for resourceDocument.`);
                }
            }
            if (item.resourceVideo && item.resourceVideo[0]) {
                const craftAssetId = String(item.resourceVideo[0]);
                if (assetMap && assetMap.has(craftAssetId)) {
                    const contentfulAssetId = assetMap.get(craftAssetId).id;
                    resourceFields.resourceVideo = { [LOCALE]: { sys: { type: "Link", linkType: "Asset", id: contentfulAssetId } } };
                } else {
                    console.warn(`   ⚠️ Asset ${craftAssetId} not found in map, skipping link for resourceVideo.`);
                }
            }

            const resourceFieldsEntry = await upsertEntry(env, "resourcesFields", `rf-${item.id}`, resourceFields, shouldPublish);

            if (!resourceFieldsEntry) {
                throw new Error("Failed to create Resources Fields entry.");
            }

            // 3. Create Main Entry
            const mainFields = {
                entryId: { [LOCALE]: String(item.id) },
                title: { [LOCALE]: item.title || "" },
                slug: { [LOCALE]: item.uri || item.slug || "" },
                resourcesFields: { [LOCALE]: makeLink(resourceFieldsEntry.sys.id) }
            };

            // 3.1 Create modular content (resourceContent)
            const sectionEntries = [];
            if (item.mixedContent) {
                for (const [blockId, block] of Object.entries(item.mixedContent)) {
                    if (block.enabled === false) continue;

                    const type = block.type;
                    const fields = block.fields || {};
                    const config = COMPONENTS[type];

                    if (!config) {
                        console.warn(`   ℹ️ skipping modular block: "${type}" (no mapping)`);
                        continue;
                    }

                    try {
                        let componentEntry;
                        if (config.handler === genericComponentHandler) {
                            const entryId = await genericComponentHandler(
                                env,
                                { id: blockId, ...fields },
                                config.mapping,
                                assetMap
                            );
                            if (entryId) {
                                componentEntry = await env.getEntry(entryId);
                            }
                        } else {
                            componentEntry = await config.handler(
                                env,
                                {
                                    blockId: blockId,
                                    ...fields,
                                    // Use common field mappings to match standard handlers
                                    heading: fields.blockHeading || fields.headingSection || "",
                                    body: fields.blockBody || fields.body || fields.bodyRedactorRestricted || "",
                                    label: fields.label || fields.ctaLinkText || "",
                                    variation: type
                                },
                                assetMap
                            );
                        }

                        if (componentEntry) {
                            sectionEntries.push(makeLink(componentEntry.sys.id));
                        }
                    } catch (err) {
                        console.error(`   🛑 Error processing block ${type} (${blockId}):`, err.message);
                    }
                }
            }
            if (sectionEntries.length > 0) {
                mainFields.resourceContent = { [LOCALE]: sectionEntries };
            }

            // 3.2 Handle SEO
            const seoEntry = await getOrCreateSeo(env, item, assetMap);
            if (seoEntry) {
                mainFields.seo = { [LOCALE]: makeLink(seoEntry.sys.id) };
            }

            // 3.3 Create Resource Settings (cptSettings)
            const settingsFields = {
                pageSetting: { [LOCALE]: `Settings: ${item.title}` },
                showAnnouncementTop: { [LOCALE]: false },
                showAnnouncementBottom: { [LOCALE]: false }
            };
            const settingsEntry = await upsertEntry(env, "cptSettings", `settings-${item.id}`, settingsFields, shouldPublish);
            if (settingsEntry) {
                mainFields.resourceSetting = { [LOCALE]: makeLink(settingsEntry.sys.id) };
            }

            const metadata = { concepts: [], tags: [] };

            // 4. Build Taxonomy Concepts metadata
            const conceptMapping = {
                "Use Cases": "useCases",
                "Manage passwords, secrets, & sessions": "managePasswordsSecretsSessions",
                "Enforce least privilege & JIT access": "enforceLeastPrivilegeJitAccess",
                "Improve identity security & posture": "improveIdentitySecurityPosture",
                "Meet compliance mandates": "meetComplianceMandates",
                "Secure all access: remote, OT, vendor, etc.": "secureAllAccessRemoteOtVendorEtc",
                "Support service desks, users, devices, & desktops": "supportServiceDesksUsersDevicesDesktops",
                "Content Type": "contentType",
                "Case Studies": "caseStudies",
                "Competitor Comparisons": "competitorComparisons",
                "Research & Reports": "researchReports",
                "Webinars": "webinars",
                "Videos": "videos",
                "Products": "products",
                "Active Directory Bridge": "activeDirectoryBridge",
                "Endpoint Privilege Management": "endpointPrivilegeManagement",
                "Endpoint Privilege Management for Unix and Linux": "endpointPrivilegeManagementForUnixAndLinux",
                "Endpoint Privilege Management for Windows and Mac": "endpointPrivilegeManagementForWindowsAndMac",
                "Entitle": "entitle",
                "Identity Security Insights": "identitySecurityInsights",
                "Password Safe": "passwordSafe",
                "Privileged Remote Access": "privilegedRemoteAccess",
                "Remote Support": "remoteSupport",
                "Industries": "industries",
                "Education": "education",
                "Energy and Utilities": "energyAndUtilities",
                "Financial Services": "financialServices",
                "Government": "government",
                "Healthcare": "healthcare",
                "High Tech": "highTech",
                "Manufacturing": "manufacturing",
                "Retail & Hospitality": "retailHospitality"
            };

            if (item.generalCategories) {
                for (const catId of item.generalCategories) {
                    const catName = getCategoryName(catId);
                    const conceptId = conceptMapping[catName];
                    if (conceptId) {
                        metadata.concepts.push({
                            sys: { type: "Link", linkType: "TaxonomyConcept", id: conceptId }
                        });
                    }
                }
            }

            // 5. Build Environment Tags metadata
            if (item.tags) {
                const contentfulTags = await processTags(env, item.tags);
                metadata.tags = contentfulTags;
            }

            // Cleanup empty metadata
            // Contentful API requires the 'tags' property to be present if 'metadata' is sent, even if empty.
            // Same for 'concepts' if you are using taxonomy.
            const finalMetadata = (metadata.concepts.length === 0 && metadata.tags.length === 0)
                ? null
                : metadata;

            if (item.typeId === 23) {
                // Webinar Specific
                mainFields.resourceFields = mainFields.resourcesFields; // Field ID is slightly different in schema for webinars
                delete mainFields.resourcesFields;

                mainFields.includeIsc2Info = { [LOCALE]: !!item.includeIsc2Info };
                mainFields.publicEvent = { [LOCALE]: !!item.publicEvent };
                mainFields.eloquaCampaignId = { [LOCALE]: String(item.eloquaCampaignId || "") };

                if (item.people && item.people.length > 0) {
                    mainFields.authorsHosts = { [LOCALE]: makeLink(`person-${item.people[0]}`) };
                }

                if (item.eventStartDate) mainFields.eventStartDate = { [LOCALE]: item.eventStartDate };
                if (item.startDateTime) mainFields.startDateTime = { [LOCALE]: item.startDateTime };
                if (item.endDateTime) mainFields.endDateTime = { [LOCALE]: item.endDateTime };

                if (item.thirdPartyUrl) mainFields.thirdPartyUrl = { [LOCALE]: String(item.thirdPartyUrl) };
                if (webcastInfoIds.length > 0) {
                    mainFields.webcastInfo = { [LOCALE]: webcastInfoIds.map(id => makeLink(id)) };
                }

                await upsertEntry(env, "resourceWebinarsCpt", `webinar-${item.id}`, mainFields, shouldPublish, finalMetadata);
            } else {
                // Standard Resource
                mainFields.resourceType = { [LOCALE]: typeLabel };
                await upsertEntry(env, "resourcesCpt", `resource-${item.id}`, mainFields, shouldPublish, finalMetadata);
            }

            console.log(`✅ ${typeLabel} "${item.title}" migrated (${shouldPublish ? 'Published' : 'Draft'}).`);

        } catch (err) {
            console.error(`❌ Error migrating ${typeLabel} "${item.title}":`, err.message);
        }
    }
}
