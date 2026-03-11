import { LOCALE, getOrCreateSeo } from "./pageHandler.js";
import { upsertEntry, makeLink } from "../utils/contentfulHelpers.js";
import { getCategoryName } from "../utils/categoryLoader.js";
import { getTagNames } from "../utils/tagHandler.js";

/**
 * Main function to migrate Video entries
 * Maps Craft CMS video data → Contentful `newVideoCpt`
 */
export async function migrateVideos(
    env,
    videoData,
    assetMap = null,
    targetIndices = null,
    totalPages = null,
    summary = null
) {
    const total = targetIndices
        ? targetIndices[targetIndices.length - 1] + 1
        : totalPages || videoData.length;
    console.log(
        `\n📹 Starting Video Migration (${videoData.length} entries)...`
    );

    const conceptMapping = {
        "Use Cases": "useCases",
        "Manage passwords, secrets, & sessions": "managePasswordsSecretsSessions",
        "Enforce least privilege & JIT access": "enforceLeastPrivilegeJitAccess",
        "Improve identity security & posture": "improveIdentitySecurityPosture",
        "Meet compliance mandates": "meetComplianceMandates",
        "Secure all access: remote, OT, vendor, etc.": "secureAllAccessRemoteOtVendorEtc",
        "Support service desks, users, devices, & desktops": "supportServiceDesksUsersDevicesDesktops",
        "Content Type": "contentType",
        "Videos": "videos",
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

    for (let i = 0; i < videoData.length; i++) {
        const item = videoData[i];
        const pageNum = targetIndices ? targetIndices[i] + 1 : i + 1;
        const progress = `[${pageNum} / ${total}]`;
        const shouldPublish = item.status === "live";

        console.log(
            `\n➡️ ${progress} Video: ${item.title} (ID: ${item.id}, Status: ${item.status})`
        );

        try {
            // -------------------------------------------------------
            // 1. Build Video Entry Fields
            // -------------------------------------------------------
            const fields = {
                entryId: { [LOCALE]: String(item.id) },
                title: { [LOCALE]: (item.title || "").trim() },
                slug: { [LOCALE]: (item.uri || item.slug || "").trim() },
                postDate: { [LOCALE]: item.postDate ? new Date(item.postDate).toISOString() : null },
            };

            if (item.postDate) {
                console.log(`   📅 Post Date: ${item.postDate} (Normalized: ${new Date(item.postDate).toISOString()})`);
            }

            // 1.1 Tags (as comma-separated Text field)
            if (item.tags && item.tags.length > 0) {
                const tagNames = getTagNames(item.tags);
                fields.tags = { [LOCALE]: tagNames.join(", ") };
                console.log(`   🏷️ Tags: ${fields.tags[LOCALE]}`);
            }

            // 1.2 SEO
            const seoEntry = await getOrCreateSeo(env, item, assetMap);
            if (seoEntry) {
                fields.seo = { [LOCALE]: makeLink(seoEntry.sys.id) };
            }

            // -------------------------------------------------------
            // 2. Build Taxonomy Concepts metadata
            // -------------------------------------------------------
            const metadata = { concepts: [] };
            const conceptsSet = new Set();

            if (item.generalCategories) {
                for (const catId of item.generalCategories) {
                    const catName = getCategoryName(catId);
                    const conceptId = conceptMapping[catName];
                    if (conceptId) conceptsSet.add(conceptId);
                }
            }

            if (conceptsSet.size > 0) {
                metadata.concepts = Array.from(conceptsSet).map(id => ({
                    sys: { type: "Link", linkType: "TaxonomyConcept", id }
                }));
            }

            const finalMetadata = metadata.concepts.length === 0 ? null : metadata;

            // -------------------------------------------------------
            // 3. Upsert the Video Entry
            // -------------------------------------------------------
            const contentfulId = `video-${item.id}`;
            const upsertedEntry = await upsertEntry(
                env,
                "newVideoCpt",
                contentfulId,
                fields,
                shouldPublish,
                finalMetadata
            );

            if (upsertedEntry) {
                console.log(
                    `✅ Video "${item.title}" migrated (${shouldPublish ? "Published" : "Draft"}).`
                );
            } else {
                console.error(`❌ Failed to migrate video "${item.title}"`);
            }
        } catch (err) {
            console.error(
                `❌ Error migrating video "${item.title}":`,
                err.message
            );
            if (err.details)
                console.error("Details:", JSON.stringify(err.details, null, 2));
        }
    }
}
