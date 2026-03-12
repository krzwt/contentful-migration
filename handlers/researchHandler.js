import { LOCALE, safeId, getOrCreateSeo, setSectionsOnPage, publishPage } from "./pageHandler.js";
import { upsertEntry, makeLink } from "../utils/contentfulHelpers.js";
import { getCategoryName } from "../utils/categoryLoader.js";
import { getTagNames, processTags } from "../utils/tagHandler.js";

import { COMPONENTS } from "../registry.js";
import { genericComponentHandler } from "./genericComponent.js";

/**
 * Main function to migrate Research entries
 */
export async function migrateResearch(env, researchData, assetMap = null, targetIndices = null, totalPages = null, summary = null) {
    const total = targetIndices ? targetIndices[targetIndices.length - 1] + 1 : (totalPages || researchData.length);
    console.log(`\n📚 Starting Research Migration (${researchData.length} entries)...`);

    for (let i = 0; i < researchData.length; i++) {
        const research = researchData[i];
        const title = research.title || "Untitled Research";
        const pageNum = targetIndices ? targetIndices[i] + 1 : i + 1;
        const progress = `[${pageNum} / ${total}]`;
        const shouldPublish = research.status === "live";

        console.log(`\n➡️ ${progress} Research: ${title} (ID: ${research.id}, Status: ${research.status})`);

        try {
            // 1. Process Tags
            const tagNames = getTagNames(research.tags);
            const tagString = tagNames.join(", ");
            if (tagString) console.log(`   🏷️  Tags: ${tagString}`);

            // 2. Handle SEO
            const seoEntry = await getOrCreateSeo(env, research, assetMap);

            // 3. Map Taxonomy Concepts (General Categories)
            const metadata = { concepts: [], tags: [] };
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
                Webinars: "webinars",
                Videos: "videos",
                Products: "products",
                "Active Directory Bridge": "activeDirectoryBridge",
                "Endpoint Privilege Management": "endpointPrivilegeManagement",
                "Endpoint Privilege Management for Unix and Linux": "endpointPrivilegeManagementForUnixAndLinux",
                "Endpoint Privilege Management for Windows and Mac": "endpointPrivilegeManagementForWindowsAndMac",
                Entitle: "entitle",
                "Identity Security Insights": "identitySecurityInsights",
                "Password Safe": "passwordSafe",
                "Privileged Remote Access": "privilegedRemoteAccess",
                "Remote Support": "remoteSupport",
                Industries: "industries",
                Education: "education",
                "Energy and Utilities": "energyAndUtilities",
                "Financial Services": "financialServices",
                Government: "government",
                Healthcare: "healthcare",
                "High Tech": "highTech",
                Manufacturing: "manufacturing",
                "Retail & Hospitality": "retailHospitality",
            };

            if (research.generalCategories && Array.isArray(research.generalCategories)) {
                for (const catId of research.generalCategories) {
                    const conceptName = getCategoryName(catId);
                    const conceptId = conceptMapping[conceptName];
                    if (conceptId) {
                        metadata.concepts.push({
                            sys: { type: "Link", linkType: "TaxonomyConcept", id: conceptId },
                        });
                    }
                }
            }

            // 4. Build Environment Tags metadata
            if (research.tags && research.tags.length > 0) {
                const contentfulTags = await processTags(env, research.tags);
                metadata.tags = contentfulTags.slice(0, 100);
            }

            const finalMetadata = metadata.concepts.length === 0 && metadata.tags.length === 0 ? null : metadata;

            // 4. Prepare Fields
            const fields = {
                entryId: { [LOCALE]: String(research.id) },
                title: { [LOCALE]: title },
                slug: { [LOCALE]: research.slug },
                postDate: { [LOCALE]: research.postDate },
                tags: { [LOCALE]: tagString || "" }
            };

            if (seoEntry) {
                fields.seo = { [LOCALE]: makeLink(seoEntry.sys.id) };
            }

            // 5. Upsert the Research Entry
            const contentfulId = `research-${research.id}`;
            let entry = await upsertEntry(env, "newResearchCpt", contentfulId, fields, shouldPublish, finalMetadata);

            if (!entry) {
                throw new Error("Failed to create/update Research entry.");
            }

            // In dry run, upsertEntry returns a mock that lacks .fields
            if (!env && entry && !entry.fields) {
                entry.fields = fields;
            }

            // 6. Process Sections (Matrix Fields)
            const sections = [];

            const processBlock = async (blockData) => {
                if (!blockData || !blockData.type) return;
                const bType = blockData.type;
                const config = COMPONENTS[bType];

                if (!config) {
                    if (summary && !summary.missingMappings.has(bType)) {
                        summary.missingMappings.set(bType, Object.keys(blockData.fields || {}));
                    }
                    return;
                }

                try {
                    let componentEntry;
                    if (config.handler === genericComponentHandler) {
                        const entryId = await genericComponentHandler(
                            env,
                            { id: blockData.id, ...blockData.fields },
                            config.mapping,
                            assetMap,
                            summary
                        );
                        if (entryId) componentEntry = await env.getEntry(entryId);
                    } else {
                        componentEntry = await config.handler(
                            env,
                            {
                                blockId: blockData.id,
                                ...blockData.fields,
                                heading: blockData.fields?.headingSection || blockData.fields?.heading || title,
                                body: blockData.fields?.bodyRedactorRestricted || blockData.fields?.bodyMedium || "",
                            },
                            assetMap,
                            summary
                        );
                    }

                    if (componentEntry) {
                        if (Array.isArray(componentEntry)) {
                            sections.push(...componentEntry);
                        } else {
                            sections.push(componentEntry);
                        }
                    }
                } catch (err) {
                    console.error(`   🛑 Error processing block ${bType}:`, err.message);
                }
            };

            // Handle Banner
            if (research.mainBannerResources) {
                for (const [id, blockData] of Object.entries(research.mainBannerResources)) {
                    await processBlock({ id, ...blockData });
                }
            }

            // Handle Content Blocks
            if (research.defaultContentBlog) {
                const blocks = Array.isArray(research.defaultContentBlog) 
                    ? research.defaultContentBlog 
                    : Object.entries(research.defaultContentBlog).map(([id, data]) => ({ id, ...data }));

                for (const blockData of blocks) {
                    await processBlock(blockData);
                }
            }

            // 7. Link Sections and Publish
            if (sections.length > 0) {
                entry = await setSectionsOnPage(env, entry, sections);
            }

            await publishPage(env, entry, research);

            console.log(`✅ Research "${title}" migrated.`);

        } catch (err) {
            console.error(`❌ Error migrating research "${title}":`, err.message);
            if (err.details) console.log(JSON.stringify(err.details, null, 2));
        }
    }
}
