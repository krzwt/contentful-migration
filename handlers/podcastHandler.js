import fs from "fs";
import { LOCALE, getOrCreateSeo, safeId } from "./pageHandler.js";
import { upsertEntry, makeLink, upsertAssetWrapper, resolveEntryRef } from "../utils/contentfulHelpers.js";
import { getCategoryName, getCategory } from "../utils/categoryLoader.js";
import { getTagNames } from "../utils/tagHandler.js";
import { convertHtmlToRichText } from "../utils/richText.js";

/**
 * Load taxonomy mapping from external file
 */
const MAPPING_FILE = "./data/taxonomy-mapping.json";
const PODCAST_CATS_FILE = "./data/taxonomy-podcastCategories.json";
let podcastTaxonomyMap = {};
let podcastCategoriesData = [];

if (fs.existsSync(MAPPING_FILE)) {
    try {
        podcastTaxonomyMap = JSON.parse(fs.readFileSync(MAPPING_FILE, "utf-8"));
        console.log(`✅ Loaded ${Object.keys(podcastTaxonomyMap).length} taxonomy mappings from ${MAPPING_FILE}`);
    } catch (err) {
        console.warn(`⚠️ Error loading taxonomy mapping: ${err.message}`);
    }
}

if (fs.existsSync(PODCAST_CATS_FILE)) {
    try {
        podcastCategoriesData = JSON.parse(fs.readFileSync(PODCAST_CATS_FILE, "utf-8"));
        console.log(`✅ Loaded ${podcastCategoriesData.length} podcast categories for auto-mapping.`);
    } catch (err) {
        console.warn(`⚠️ Error loading podcast categories: ${err.message}`);
    }
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

            let activeBanner = null;
            if (item.mainBannerResources) {
                const bannerBlocks = Object.values(item.mainBannerResources);
                activeBanner = bannerBlocks.find((b) => b.enabled);
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
                title: { [LOCALE]: (item.title || "").trim() },
                slug: { [LOCALE]: (item.uri || item.slug || "").trim() },
                bannerHeading: { [LOCALE]: (bannerHeading || item.title || "Untitled").trim() },
                postDate: { [LOCALE]: item.postDate ? new Date(item.postDate).toISOString() : null },
                useLandscapeImageOrVideo: { [LOCALE]: activeBanner?.fields?.switch || false },
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

            // 2.2 Background Image (Required - map-1323786 logic)
            if (bannerImageId && assetMap) {
                const assetInfo = assetMap.get(bannerImageId);
                if (assetInfo && assetInfo.id) {
                    fields.backgroundImage = { [LOCALE]: { sys: { type: "Link", linkType: "Asset", id: assetInfo.id } } };
                } else {
                    fields.backgroundImage = { [LOCALE]: null };
                }
            } else {
                fields.backgroundImage = { [LOCALE]: null };
            }


            // 2.3 Landscape Video
            if (bannerVideoId && assetMap) {
                const assetInfo = assetMap.get(bannerVideoId);
                if (assetInfo && assetInfo.id) {
                    if (assetInfo.wistiaUrl) {
                        fields.landscapeVideoUrl = { [LOCALE]: assetInfo.wistiaUrl };
                    } else {
                        fields.landscapeVideo = { [LOCALE]: { sys: { type: "Link", linkType: "Asset", id: assetInfo.id } } };
                    }
                }
            }

            // 2.4 Authors / Hosts (from banner people → peopleCpt references; only link if entry exists)
            if (bannerPeople.length > 0) {
                const authorLinks = [];
                const missingAuthors = [];
                for (const pid of bannerPeople) {
                    const ref = resolveEntryRef(pid);
                    if (ref && ref.id) {
                        authorLinks.push(makeLink(ref.id));
                    } else {
                        missingAuthors.push(`person-${pid}`);
                    }
                }
                if (authorLinks.length > 0) {
                    fields.authorsHosts = { [LOCALE]: authorLinks };
                }
                if (missingAuthors.length > 0) {
                    console.warn(`   ⚠ Authors/Hosts not in Contentful — skipped: ${missingAuthors.join(", ")}`);
                }
                console.log(
                    `   👤 Authors/Hosts: ${bannerPeople.map((p) => `person-${p}`).join(", ")}`
                );
            }

            // 2.5 Podcasts (audio asset — direct Asset link)
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
                }
            }

            // 2.6 Podcast Duration
            if (item.podcastDuration) {
                fields.podcastDuration = { [LOCALE]: parseInt(item.podcastDuration) || null };
            }

            // 2.7 Guests (top-level people → peopleCpt references; only link if entry exists)
            if (item.people && item.people.length > 0) {
                const guestLinks = [];
                const missingGuests = [];
                for (const pid of item.people) {
                    const ref = resolveEntryRef(pid);
                    if (ref && ref.id) {
                        guestLinks.push(makeLink(ref.id));
                    } else {
                        missingGuests.push(`person-${pid}`);
                    }
                }
                if (guestLinks.length > 0) {
                    fields.guests = { [LOCALE]: guestLinks };
                } else {
                    fields.guests = { [LOCALE]: [] };
                }
                if (missingGuests.length > 0) {
                    console.warn(`   ⚠ Guest(s) not in Contentful — skipped: ${missingGuests.join(", ")}`);
                }
            }

            // 2.8 Podcast Description (RichText)
            if (item.podcastDescription) {
                fields.podcastDescription = {
                    [LOCALE]: await convertHtmlToRichText(env, item.podcastDescription),
                };
            }

            // 2.9 Text Content (RichText)
            if (item.textContent) {
                fields.textContent = {
                    [LOCALE]: await convertHtmlToRichText(env, item.textContent),
                };
            }

            // 2.10 Podcast Image (direct Asset link - used as thumbnail)
            if (item.podcastImage && item.podcastImage[0]) {
                const craftImageId = String(item.podcastImage[0]);
                const imageInfo = assetMap && assetMap.get(craftImageId);
                if (imageInfo) {
                    fields.podcastImage = { [LOCALE]: { sys: { type: "Link", linkType: "Asset", id: imageInfo.id } } };
                } else {
                    fields.podcastImage = { [LOCALE]: null };
                }
            } else {
                fields.podcastImage = { [LOCALE]: null };
            }

            // 2.11 Tags
            if (item.tags && item.tags.length > 0) {
                const tagNames = getTagNames(item.tags);
                const tagsString = tagNames.join(", ");
                const tagsEntry = await upsertEntry(
                    env, "tags", `tags-podcast-${item.id}`,
                    { tags: { [LOCALE]: tagsString } }, shouldPublish
                );
                if (tagsEntry) {
                    fields.tags = { [LOCALE]: makeLink(tagsEntry.sys.id) };
                }
            }

            // 2.12 SEO
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

            // 3.1 & 3.2 Combine all categories and deduplicate by Concept ID
            const conceptsSet = new Set();

            // Collect from General Categories
            if (item.generalCategories) {
                for (const catId of item.generalCategories) {
                    const catName = getCategoryName(catId);
                    const conceptId = conceptMapping[catName];
                    if (conceptId) conceptsSet.add(conceptId);
                }
            }

            // Collect from Podcast Categories
            if (item.podcastCategories && item.podcastCategories.length > 0) {
                for (const catId of item.podcastCategories) {
                    let conceptId = podcastTaxonomyMap[String(catId)];

                    // Only fallback to auto-mapping if the ID is strictly not found in the map
                    if (conceptId === undefined) {
                        const cat = podcastCategoriesData.find(c => String(c.id) === String(catId));
                        if (cat) {
                            // If it's a known failing one or has hyphens, convert to camelCase
                            if (cat.slug && cat.slug.includes("-")) {
                                conceptId = cat.slug.split("-").map((word, index) =>
                                    index === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1)
                                ).join("");
                            } else {
                                // For single words like "lulzsec" or "wehackpurple", check if title has camelCase structure
                                if (cat.title && cat.title.match(/[A-Z].*[A-Z]/)) {
                                    conceptId = cat.title.charAt(0).toLowerCase() + cat.title.slice(1);
                                } else if (cat.title === "LulzSec") {
                                    conceptId = "lulzSec";
                                } else {
                                    conceptId = cat.slug;
                                }
                            }
                        }
                    }

                    if (conceptId) {
                        conceptsSet.add(conceptId);
                    } else if (conceptId !== "") {
                        const catName = getCategoryName(catId);
                        console.warn(`   ⚠️ No Taxonomy mapping for podcastCategory: ${catName || "Unknown"} (ID: ${catId})`);
                    }
                }
            }

            if (conceptsSet.size > 0) {
                metadata.concepts = Array.from(conceptsSet).map(id => ({
                    sys: { type: "Link", linkType: "TaxonomyConcept", id }
                }));
            }

            const finalMetadata = metadata.concepts.length === 0 && metadata.tags.length === 0
                ? null
                : metadata;

            // -------------------------------------------------------
            // 4. Upsert the Podcast Entry
            // -------------------------------------------------------
            const contentfulId = `podcast-${item.id}`;
            const upsertedEntry = await upsertEntry(
                env,
                "podcastsCpt",
                contentfulId,
                fields,
                shouldPublish,
                finalMetadata
            );

            if (upsertedEntry) {
                console.log(
                    `✅ Podcast "${item.title}" migrated (${shouldPublish ? "Published" : "Draft"}).`
                );
            } else {
                console.error(`❌ Failed to migrate podcast "${item.title}"`);
            }
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
