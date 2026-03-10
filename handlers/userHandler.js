import { LOCALE } from "./pageHandler.js";
import { upsertEntry, makeLink } from "../utils/contentfulHelpers.js";

/**
 * Main function to migrate User entries
 */
export async function migrateUsers(env, userData, assetMap = null, targetIndices = null, totalPages = null, summary = null) {
    const total = targetIndices ? targetIndices[targetIndices.length - 1] + 1 : (totalPages || userData.length);
    console.log(`\n👤 Starting Users Migration (${userData.length} entries)...`);

    for (let i = 0; i < userData.length; i++) {
        const user = userData[i];
        const userName = user.fullName || user.username || "Unknown User";
        const pageNum = targetIndices ? targetIndices[i] + 1 : i + 1;
        const progress = `[${pageNum} / ${total}]`;

        // Determine status and publish state
        // Status in Contentful: ["Active", "Pending", "Suspended", "Locked", "Inactive"]
        // Status in JSON: lowercase versions likely
        const statusMap = {
            "active": "Active",
            "pending": "Pending",
            "suspended": "Suspended",
            "locked": "Locked",
            "inactive": "Inactive"
        };
        const contentfulStatus = statusMap[user.status] || "Active";
        const shouldPublish = user.status === "active";

        console.log(`\n➡️ ${progress} User: ${userName} (ID: ${user.id}, Status: ${user.status} -> ${contentfulStatus})`);

        try {
            // 1. Prepare Fields
            const fields = {
                entryId: { [LOCALE]: String(user.id) },
                status: { [LOCALE]: contentfulStatus },
                createdAt: { [LOCALE]: user.dateCreated },
                fullName: { [LOCALE]: user.fullName || "" },
                username: { [LOCALE]: user.username || "" },
                jobTitle: { [LOCALE]: user.jobTitle || "" },
                biography: { [LOCALE]: cleanHtml(user.biography || "") },
            };

            // 2. Handle Photos (Media)
            if (user.profilePhoto && user.profilePhoto[0]) {
                const craftAssetId = String(user.profilePhoto[0]);
                let contentfulAssetId = `asset-${craftAssetId}`;
                if (assetMap && assetMap.has(craftAssetId)) {
                    contentfulAssetId = assetMap.get(craftAssetId).id;
                }
                fields.profilePhoto = {
                    [LOCALE]: { sys: { type: "Link", linkType: "Asset", id: contentfulAssetId } }
                };
            }

            if (user.photoId) {
                const craftAssetId = String(user.photoId);
                let contentfulAssetId = `asset-${craftAssetId}`;
                if (assetMap && assetMap.has(craftAssetId)) {
                    contentfulAssetId = assetMap.get(craftAssetId).id;
                }
                fields.photo = {
                    [LOCALE]: { sys: { type: "Link", linkType: "Asset", id: contentfulAssetId } }
                };
            }

            // 3. Handle Questions (Links to 'questions' entries)
            if (user.questions && user.questions.length > 0) {
                // Assuming questions are IDs that match the 'question-' prefix pattern
                fields.questions = {
                    [LOCALE]: user.questions.map(qId => makeLink(`question-${qId}`))
                };
            }

            // 4. Upsert the User
            const contentfulId = `user-${user.id}`;
            await upsertEntry(env, "users", contentfulId, fields, shouldPublish);
            console.log(`✅ User "${userName}" migrated (${shouldPublish ? 'Published' : 'Draft'}).`);

        } catch (err) {
            console.error(`❌ Error migrating user "${userName}":`, err.message);
        }
    }
}

/**
 * Helper to clean HTML tags for a Markdown field
 */
function cleanHtml(html) {
    if (!html) return "";
    return html
        .replace(/<p>/g, "")
        .replace(/<\/p>/g, "\n\n")
        .replace(/<br\s*\/?>/g, "\n")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .trim();
}
