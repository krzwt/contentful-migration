import fs from "fs";
import { LOCALE, getOrCreateSeo, safeId, publishPage } from "./pageHandler.js";
import { upsertEntry, makeLink } from "../utils/contentfulHelpers.js";
import { COMPONENTS } from "../registry.js";
import { genericComponentHandler } from "./genericComponent.js";
import { getOrderedKeys } from "../utils/jsonOrder.js";
import { convertHtmlToRichText } from "../utils/richText.js";

/**
 * Main function to migrate Blog entries
 */
export async function migrateBlogs(
    env,
    blogData,
    assetMap = null,
    targetIndices = null,
    totalPages = null,
    summary = null,
    rawFileContent = null
) {
    const total = targetIndices
        ? targetIndices[targetIndices.length - 1] + 1
        : totalPages || blogData.length;
    console.log(`\n📰 Starting Blog Migration (${blogData.length} entries)...`);

    for (let i = 0; i < blogData.length; i++) {
        const item = blogData[i];
        const pageNum = targetIndices ? targetIndices[i] + 1 : i + 1;
        const progress = `[${pageNum} / ${total}]`;
        const shouldPublish = item.status === "live";

        console.log(`\n➡️ ${progress} Blog: ${item.title} (ID: ${item.id})`);

        try {
            // -------------------------------------------------------
            // 1. Extract Banner & Author Data
            // -------------------------------------------------------
            let bannerImageId = null;
            let bannerAuthors = [];
            let bannerEntryLink = null;
            let abstract = "";

            if (item.mainBannerResources) {
                const bannerBlocks = Object.values(item.mainBannerResources);
                const activeBanner = bannerBlocks.find((b) => b.enabled && b.type === "bannerImmersive");
                if (activeBanner && activeBanner.fields) {
                    const fields = activeBanner.fields;
                    if (fields.resourceBannerImage && fields.resourceBannerImage[0]) {
                        bannerImageId = String(fields.resourceBannerImage[0]);
                    }
                    if (fields.people && fields.people.length > 0) {
                        bannerAuthors = fields.people;
                    }
                    abstract = fields.bodyRedactorRestricted || fields.description || "";

                    // Create the bannerImmersive entry itself
                    const bannerId = `banner-blog-${item.id}`;
                    const bannerConfig = COMPONENTS["bannerImmersive"];
                    if (bannerConfig && bannerConfig.handler) {
                        const bannerEntry = await bannerConfig.handler(env, {
                            blockId: bannerId,
                            ...fields,
                            heading: fields.heading || item.title,
                            body: fields.bodyRedactorRestricted || fields.description || "",
                            variation: "bannerImmersive"
                        }, assetMap);

                        if (bannerEntry) {
                            bannerEntryLink = makeLink(bannerEntry.sys.id);
                        }
                    }
                }
            }

            // -------------------------------------------------------
            // 2. Build Blog Entry Fields
            // -------------------------------------------------------
            const blogFields = {
                entryId: { [LOCALE]: String(item.id) },
                title: { [LOCALE]: (item.title || "").trim() },
                slug: { [LOCALE]: (item.uri || item.slug || "").trim() },
                postDate: { [LOCALE]: item.postDate ? new Date(item.postDate).toISOString() : null },
                entryType: { [LOCALE]: "Blog" }, // Default to "Blog"
                introduction: { [LOCALE]: (item.introduction || "").replace(/<[^>]*>?/gm, '').trim() }, // Simple strip HTML for Text field
            };

            if (abstract) {
                blogFields.abstract = { [LOCALE]: abstract.replace(/<[^>]*>?/gm, '').trim() };
            }

            // 2.1 Banner & Card Image
            if (bannerImageId && assetMap) {
                const assetInfo = assetMap.get(bannerImageId);
                if (assetInfo && assetInfo.id) {
                    blogFields.bannerImage = { [LOCALE]: makeLink(assetInfo.id, "Asset") };
                    blogFields.resourceCardImage = { [LOCALE]: makeLink(assetInfo.id, "Asset") };
                }
            }

            // 2.2 Authors / Hosts
            if (bannerAuthors.length > 0) {
                blogFields.authorsHosts = {
                    [LOCALE]: bannerAuthors.map((pid) => makeLink(`person-${pid}`))
                };
            }

            // 2.3 Main Banner Link
            if (bannerEntryLink) {
                blogFields.mainBanner = { [LOCALE]: bannerEntryLink };
            }

            // 2.4 SEO
            const seoEntry = await getOrCreateSeo(env, item, assetMap);
            if (seoEntry) {
                blogFields.seo = { [LOCALE]: makeLink(seoEntry.sys.id) };
            }

            // -------------------------------------------------------
            // 3. Process Content Components
            // -------------------------------------------------------
            const componentEntries = [];
            const getPageSegment = (itemId) => {
                if (!rawFileContent) return "";
                const pIdIdx = rawFileContent.indexOf(`"id": ${itemId}`);
                if (pIdIdx === -1) return "";
                const nextPIdx = rawFileContent.indexOf('"id":', pIdIdx + 10);
                return rawFileContent.substring(pIdIdx, nextPIdx === -1 ? undefined : nextPIdx);
            };
            const pageSegment = getPageSegment(item.id);

            // Detect component fields (defaultContentBlog, bottomContentBlog)
            const componentFieldKeys = ['defaultContentBlog', 'bottomContentBlog'];
            let bottomContentLink = null;

            for (const fieldKey of componentFieldKeys) {
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
                        if (summary) {
                            if (!summary.missingMappings.has(type)) {
                                summary.missingMappings.set(type, Object.keys(fields || {}));
                            }
                        }
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
                            if (entryId) entry = { sys: { id: entryId } };
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
                            if (fieldKey === 'bottomContentBlog' && type === 'resourceTabSection') {
                                bottomContentLink = makeLink(entry.sys.id);
                            } else {
                                if (Array.isArray(entry)) {
                                    componentEntries.push(...entry.map(e => makeLink(e.sys.id)));
                                } else {
                                    componentEntries.push(makeLink(entry.sys.id));
                                }
                            }
                        }
                    } catch (err) {
                        console.error(`   🛑 Error processing block ${type} (${blockId}):`, err.message);
                    }
                }
            }

            if (componentEntries.length > 0) {
                blogFields.contentComponents = { [LOCALE]: componentEntries };
            }
            if (bottomContentLink) {
                blogFields.bottomContent = { [LOCALE]: bottomContentLink };
            }

            // -------------------------------------------------------
            // 4. Tags (Linked Entry)
            // -------------------------------------------------------
            if (item.tags && item.tags.length > 0) {
                const { getTagNames } = await import("../utils/tagHandler.js");
                const tagNames = getTagNames(item.tags);
                const tagsString = tagNames.join(", ");
                const tagsEntry = await upsertEntry(
                    env,
                    "tags",
                    `tags-blog-${item.id}`,
                    { tags: { [LOCALE]: tagsString } },
                    shouldPublish
                );
                if (tagsEntry) {
                    blogFields.tags = { [LOCALE]: makeLink(tagsEntry.sys.id) };
                }
            }

            // -------------------------------------------------------
            // 5. Taxonomy & Metadata
            // -------------------------------------------------------
            const metadata = {
                concepts: [],
                tags: [] // Initialize with empty array to satisfy space requirements
            };

            if (item.generalCategories) {
                const { getCategoryName } = await import("../utils/categoryLoader.js");
                const conceptMapping = {
                    "Use Cases": "useCases",
                    "Manage passwords, secrets, & sessions": "managePasswordsSecretsSessions",
                    "Enforce least privilege & JIT access": "enforceLeastPrivilegeJitAccess",
                    "Improve identity security & posture": "improveIdentitySecurityPosture",
                    "Meet compliance mandates": "meetComplianceMandates",
                    "Secure all access: remote, OT, vendor, etc.": "secureAllAccessRemoteOtVendorEtc",
                    "Support service desks, users, devices, & desktops": "supportServiceDesksUsersDevicesDesktops",
                    "Videos": "videos",
                    "Products": "products",
                    "Industries": "industries",
                    "Manufacturing": "manufacturing",
                    "Healthcare": "healthcare",
                    "Financial Services": "financialServices",
                    "Government": "government",
                    "High Tech": "highTech",
                    "Education": "education",
                    "Energy and Utilities": "energyAndUtilities",
                    "Retail & Hospitality": "retailHospitality"
                };

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

            // -------------------------------------------------------
            // 6. Upsert the Blog Entry
            // -------------------------------------------------------
            const blogEntry = await upsertEntry(
                env,
                "blogCpt",
                `blog-${item.id}`,
                blogFields,
                shouldPublish,
                metadata // Always send metadata to satisfy potential tag requirements
            );

            if (blogEntry && shouldPublish) {
                await publishPage(env, blogEntry, item);
            }

            console.log(`✅ Blog "${item.title}" migrated.`);

        } catch (err) {
            console.error(`❌ Error migrating blog "${item.title}":`, err.message);
        }
    }
}
