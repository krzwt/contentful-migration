import fs from "fs";
import { LOCALE, getOrCreateSeo, safeId } from "./pageHandler.js";
import { upsertEntry, makeLink, upsertAssetWrapper } from "../utils/contentfulHelpers.js";
import { getCategoryName, getCategory } from "../utils/categoryLoader.js";
import { getTagNames } from "../utils/tagHandler.js";
import { convertHtmlToRichText } from "../utils/richText.js";

/**
 * Load taxonomy mapping from external file
 */
const MAPPING_FILE = "./data/taxonomy-mapping.json";
let podcastTaxonomyMap = {};
if (fs.existsSync(MAPPING_FILE)) {
    try {
        podcastTaxonomyMap = JSON.parse(fs.readFileSync(MAPPING_FILE, "utf-8"));
        console.log(`✅ Loaded ${Object.keys(podcastTaxonomyMap).length} taxonomy mappings from ${MAPPING_FILE}`);
    } catch (err) {
        console.warn(`⚠️ Error loading taxonomy mapping: ${err.message}`);
    }
} else {
    // Fallback if file missing
    podcastTaxonomyMap = {
        "85850": "cybersecurity",
        "85854": "penetrationTesting",
        "86649": "aliceAndBob"
    };
}


/**
 * Main function to migrate Podcast entries
 * Maps Craft CMS podcast data → Contentful `podcastsCpt`
 */
export async function migratePodcasts(
    env,
    podcastData,
    assetMap = null,
    targetIndices = null,
    totalPages = null,
    summary = null
) {
    const total = targetIndices
        ? targetIndices[targetIndices.length - 1] + 1
        : totalPages || podcastData.length;
    console.log(
        `\n🎙️ Starting Podcast Migration (${podcastData.length} entries)...`
    );

    for (let i = 0; i < podcastData.length; i++) {
        const item = podcastData[i];
        const pageNum = targetIndices ? targetIndices[i] + 1 : i + 1;
        const progress = `[${pageNum} / ${total}]`;
        const shouldPublish = item.status === "live";

        console.log(
            `\n➡️ ${progress} Podcast: ${item.title} (ID: ${item.id}, Status: ${item.status})`
        );

        try {
            // -------------------------------------------------------
            // 1. Extract Banner Data
            // -------------------------------------------------------
            let bannerHeading = item.title; // fallback
            let bannerDescription = "";
            let bannerImageId = null;
            let bannerVideoId = null;
            let bannerPeople = []; // authorsHosts

            if (item.mainBannerResources) {
                const bannerBlocks = Object.values(item.mainBannerResources);
                const activeBanner = bannerBlocks.find((b) => b.enabled);
                if (activeBanner && activeBanner.fields) {
                    const bf = activeBanner.fields;
                    bannerHeading = bf.heading || item.title;
                    bannerDescription = bf.bodyRedactorRestricted || "";
                    if (bf.resourceBannerImage && bf.resourceBannerImage[0]) {
                        bannerImageId = String(bf.resourceBannerImage[0]);
                    }
                    if (bf.switch && bf.resourceVideo && bf.resourceVideo[0]) {
                        bannerVideoId = String(bf.resourceVideo[0]);
                    }
                    if (bf.people && bf.people.length > 0) {
                        bannerPeople = bf.people;
                    }
                }
            }

            // -------------------------------------------------------
            // 2. Build Podcast Entry Fields
            // -------------------------------------------------------
            const fields = {
                entryId: { [LOCALE]: String(item.id) },
                title: { [LOCALE]: item.title || "" },
                slug: { [LOCALE]: item.uri || item.slug || "" },
                bannerHeading: { [LOCALE]: bannerHeading || item.title || "Untitled" },
                postDate: { [LOCALE]: item.postDate ? new Date(item.postDate).toISOString() : null },
            };

            if (item.postDate) {
                console.log(`   📅 Post Date: ${item.postDate} (Normalized: ${new Date(item.postDate).toISOString()})`);
            }

            // 2.1 Banner Description (RichText)
            if (bannerDescription) {
                fields.bannerDescription = {
                    [LOCALE]: await convertHtmlToRichText(env, bannerDescription),
                };
            }

            // 2.2 Add Asset (banner image/video wrapper → `asset` content type entry)
            const assetSourceId = bannerVideoId || bannerImageId;
            if (assetSourceId) {
                const assetInfo = assetMap && assetMap.get(assetSourceId);
                if (assetInfo) {
                    const assetWrapper = await upsertAssetWrapper(
                        env,
                        `podcast-banner-${item.id}`,
                        assetInfo.id,
                        assetInfo.mimeType,
                        assetInfo.wistiaUrl
                    );
                    if (assetWrapper) {
                        fields.addAsset = {
                            [LOCALE]: makeLink(assetWrapper.sys.id),
                        };
                    }
                } else {
                    console.warn(
                        `   ⚠️ Banner asset ${assetSourceId} not found in map, skipping addAsset.`
                    );
                }
            }

            // 2.3 Authors / Hosts (from banner people → peopleCpt references)
            if (bannerPeople.length > 0) {
                fields.authorsHosts = {
                    [LOCALE]: bannerPeople.map((pid) => makeLink(`person-${pid}`)),
                };
                console.log(
                    `   👤 Authors/Hosts: ${bannerPeople.map((p) => `person-${p}`).join(", ")}`
                );
            }

            // 2.4 Podcasts (audio asset — direct Asset link)
            if (item.podcasts && item.podcasts[0]) {
                const craftAudioId = String(item.podcasts[0]);
                const audioInfo = assetMap && assetMap.get(craftAudioId);
                if (audioInfo) {
                    fields.podcasts = {
                        [LOCALE]: {
                            sys: { type: "Link", linkType: "Asset", id: audioInfo.id },
                        },
                    };
                    console.log(`   🎵 Audio asset linked: ${audioInfo.id}`);
                } else {
                    console.warn(
                        `   ⚠️ Audio asset ${craftAudioId} not found in map, skipping podcasts field.`
                    );
                }
            }

            // 2.5 Podcast Duration
            if (item.podcastDuration) {
                fields.podcastDuration = { [LOCALE]: item.podcastDuration };
            }

            // 2.6 Guests (top-level people → peopleCpt references)
            if (item.people && item.people.length > 0) {
                fields.guests = {
                    [LOCALE]: item.people.map((pid) => makeLink(`person-${pid}`)),
                };
                console.log(
                    `   🎤 Guests: ${item.people.map((p) => `person-${p}`).join(", ")}`
                );
            }

            // 2.7 Podcast Description (RichText)
            if (item.podcastDescription) {
                fields.podcastDescription = {
                    [LOCALE]: await convertHtmlToRichText(env, item.podcastDescription),
                };
            }

            // 2.8 Text Content (RichText)
            if (item.textContent) {
                fields.textContent = {
                    [LOCALE]: await convertHtmlToRichText(env, item.textContent),
                };
            }

            // 2.9 Podcast Image (direct Asset link — image mime type)
            if (item.podcastImage && item.podcastImage[0]) {
                const craftImageId = String(item.podcastImage[0]);
                const imageInfo = assetMap && assetMap.get(craftImageId);
                if (imageInfo) {
                    fields.podcastImage = {
                        [LOCALE]: {
                            sys: { type: "Link", linkType: "Asset", id: imageInfo.id },
                        },
                    };
                    console.log(`   🖼️ Podcast image linked: ${imageInfo.id}`);
                } else {
                    console.warn(
                        `   ⚠️ Image asset ${craftImageId} not found in map, skipping podcastImage.`
                    );
                }
            }

            // 2.10 Tags
            if (item.tags && item.tags.length > 0) {
                const tagNames = getTagNames(item.tags);
                const tagsString = tagNames.join(", ");
                console.log(
                    `   🏷️ Tags: "${tagsString.substring(0, 50)}..."`
                );

                const tagsEntry = await upsertEntry(
                    env,
                    "tags",
                    `tags-podcast-${item.id}`,
                    { tags: { [LOCALE]: tagsString } },
                    shouldPublish
                );

                if (tagsEntry) {
                    fields.tags = { [LOCALE]: makeLink(tagsEntry.sys.id) };
                }
            }

            // 2.11 SEO
            const seoEntry = await getOrCreateSeo(env, item, assetMap);
            if (seoEntry) {
                fields.seo = { [LOCALE]: makeLink(seoEntry.sys.id) };
            }

            // -------------------------------------------------------
            // 3. Build Taxonomy Concepts metadata
            // -------------------------------------------------------
            const metadata = { concepts: [], tags: [] };

            // 3.1 General Categories → taxonomy concepts
            const conceptMapping = {
                "Use Cases": "useCases",
                "Manage passwords, secrets, & sessions":
                    "managePasswordsSecretsSessions",
                "Enforce least privilege & JIT access":
                    "enforceLeastPrivilegeJitAccess",
                "Improve identity security & posture": "improveIdentitySecurityPosture",
                "Meet compliance mandates": "meetComplianceMandates",
                "Secure all access: remote, OT, vendor, etc.":
                    "secureAllAccessRemoteOtVendorEtc",
                "Support service desks, users, devices, & desktops":
                    "supportServiceDesksUsersDevicesDesktops",
                "Content Type": "contentType",
                "Videos": "videos",
                Products: "products",
                "Active Directory Bridge": "activeDirectoryBridge",
                "Endpoint Privilege Management": "endpointPrivilegeManagement",
                "Endpoint Privilege Management for Unix and Linux":
                    "endpointPrivilegeManagementForUnixAndLinux",
                "Endpoint Privilege Management for Windows and Mac":
                    "endpointPrivilegeManagementForWindowsAndMac",
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

            if (item.generalCategories) {
                for (const catId of item.generalCategories) {
                    const catName = getCategoryName(catId);
                    const conceptId = conceptMapping[catName];
                    if (conceptId) {
                        metadata.concepts.push({
                            sys: {
                                type: "Link",
                                linkType: "TaxonomyConcept",
                                id: conceptId,
                            },
                        });
                    }
                }
            }

            // 3.2 Podcast Categories → podcastCategories taxonomy concepts
            // These are from the podcastCategories taxonomy scheme
            if (item.podcastCategories && item.podcastCategories.length > 0) {
                for (const catId of item.podcastCategories) {
                    const conceptId = podcastTaxonomyMap[String(catId)];

                    if (conceptId) {
                        metadata.concepts.push({
                            sys: {
                                type: "Link",
                                linkType: "TaxonomyConcept",
                                id: conceptId,
                            },
                        });
                    } else {
                        const catName = getCategoryName(catId);
                        console.warn(
                            `   ⚠️  No Taxonomy mapping for category: ${catName || "Unknown"} (ID: ${catId}). ` +
                            `Add it to data/taxonomy-mapping.json`
                        );
                    }
                }
            }

            const finalMetadata =
                metadata.concepts.length === 0 && metadata.tags.length === 0
                    ? null
                    : metadata;

            // -------------------------------------------------------
            // 4. Upsert the Podcast Entry
            // -------------------------------------------------------
            const contentfulId = `podcast-${item.id}`;
            await upsertEntry(
                env,
                "podcastsCpt",
                contentfulId,
                fields,
                shouldPublish,
                finalMetadata
            );

            console.log(
                `✅ Podcast "${item.title}" migrated (${shouldPublish ? "Published" : "Draft"}).`
            );
        } catch (err) {
            console.error(
                `❌ Error migrating podcast "${item.title}":`,
                err.message
            );
            if (err.details)
                console.error("Details:", JSON.stringify(err.details, null, 2));
        }
    }
}
