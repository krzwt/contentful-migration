import { makeLink, upsertEntry, parseCraftLink, resolveEntryRef } from "../utils/contentfulHelpers.js";

const LOCALE = "en-US";

const ALLOWED_TARGET_TYPES = [
    "page",
    "newStandaloneContent",
    "newStandaloneMicrosite",
    "newStandaloneThankYou",
    "newStandaloneConversion",
    "company",
    "newCompany"
];

/**
 * Normalizes themeType to Contentful enum values
 */
function normalizeThemeType(type) {
    switch (type) {
        case "shortFullBarWithImageOption":
            return "Short Full Bar (with image option)";
        case "shortHalfBarNoImage":
            return "Short Half Bar (no image)";
        case "longTallBarMoreText":
            return "Long Tall Bar (more text)";
        case "longShortBarLessText":
            return "Long Short Bar (less text)";
        default:
            if (!type) return "Short Full Bar (with image option)";
            // Attempt generic mapping if it's already close
            if (type.includes("Short Full")) return "Short Full Bar (with image option)";
            return "Short Full Bar (with image option)";
    }
}

/**
 * Main function to migrate Announcements
 */
export async function migrateAnnouncements(
    env,
    announcementData,
    assetMap = null,
    summary = null
) {
    console.log(`\n📢 Starting Announcements Migration (${announcementData.length} entries)...`);

    for (let i = 0; i < announcementData.length; i++) {
        const item = announcementData[i];
        console.log(`\n➡️ [${i + 1} / ${announcementData.length}] Announcement: ${item.title} (ID: ${item.id})`);

        try {
            const isTop = String(item.typeId) === "154";
            const isBottom = String(item.typeId) === "153";

            const fields = {
                entryId: { [LOCALE]: String(item.id) },
                // announcementTitle is the displayField, so always fill it from Craft title
                announcementTitle: { [LOCALE]: (item.title || "").trim() },
            };

            const linkData = parseCraftLink(item.contentLink);
            const finalUrl = linkData.url || "";
            const finalLabel = item.linkText || linkData.label || "";

            if (isTop) {
                // --- Group: Announcement Top ---
                fields.messageTop = { [LOCALE]: (item.message || "").trim() };
                fields.contentLinkTop = { [LOCALE]: finalUrl };
                fields.linkTextTop = { [LOCALE]: finalLabel };

                // Targeting (Header)
                if (item.targetEntries && Array.isArray(item.targetEntries)) {
                    const validLinks = [];
                    for (const tid of item.targetEntries) {
                        const ref = resolveEntryRef(tid);
                        if (!ref) {
                            // console.log(`   ⚠️ Target ${tid} not found in cache.`);
                            continue;
                        }
                        if (ALLOWED_TARGET_TYPES.includes(ref.type)) {
                            validLinks.push(makeLink(ref.id));
                        } else {
                            console.log(`   🚫 Filtering out target ${tid} of type ${ref.type} (Sys.ID: ${ref.id}) for field ${isTop ? "Header" : "Bottom"}`);
                        }
                    }

                    if (validLinks.length > 0) {
                        fields.headerAnnouncementTargetEntries = { [LOCALE]: validLinks };
                        console.log(`   🔗 Linked ${validLinks.length} target entries (Header).`);
                    } else if (item.targetEntries.length > 0) {
                        console.log(`   ⚠️ Could not resolve any allowed target entries in Contentful. Skipping links.`);
                    }
                }
            } else if (isBottom) {
                // --- Group: Announcement Bottom ---
                fields.announcementBottomTitle = { [LOCALE]: (item.title || "").trim() };
                fields.useModernTheme = { [LOCALE]: item.switch !== undefined ? !!item.switch : true };
                fields.themeType = { [LOCALE]: normalizeThemeType(item.themeType) };
                fields.headingSection = { [LOCALE]: (item.headingSection || "").trim() };
                fields.message = { [LOCALE]: (item.message || "").trim() };
                fields.contentLink = { [LOCALE]: finalUrl };
                fields.linkText = { [LOCALE]: finalLabel };

                // Image
                if (item.image && item.image[0] && assetMap) {
                    const assetInfo = assetMap.get(String(item.image[0]));
                    if (assetInfo && assetInfo.id) {
                        fields.announcementImage = { [LOCALE]: makeLink(assetInfo.id, "Asset") };
                    }
                }

                // Targeting (Bottom)
                let targetEntries = [];
                if (Array.isArray(item.targetEntries)) {
                    targetEntries = item.targetEntries;
                } else if (item.targeting && typeof item.targeting === 'object') {
                    const firstTarget = Object.values(item.targeting)[0];
                    if (firstTarget && firstTarget.fields && Array.isArray(firstTarget.fields.targetEntries)) {
                        targetEntries = firstTarget.fields.targetEntries;
                    }
                }

                if (targetEntries.length > 0) {
                    const validLinks = [];
                    for (const tid of targetEntries) {
                        const ref = resolveEntryRef(tid);
                        if (!ref) {
                            // console.log(`   ⚠️ Target ${tid} not found in cache.`);
                            continue;
                        }
                        if (ALLOWED_TARGET_TYPES.includes(ref.type)) {
                            validLinks.push(makeLink(ref.id));
                        } else {
                            console.log(`   🚫 Filtering out target ${tid} of type ${ref.type} (Sys.ID: ${ref.id}) for field ${isBottom ? "Bottom" : "Header"}`);
                        }
                    }

                    if (validLinks.length > 0) {
                        fields.bottomAnnouncementTargetEntries = { [LOCALE]: validLinks };
                        console.log(`   🔗 Linked ${validLinks.length} target entries (Bottom).`);
                    } else if (targetEntries.length > 0) {
                        console.log(`   ⚠️ Could not resolve any allowed target entries in Contentful. Skipping links.`);
                    }
                }
            }

            await upsertEntry(
                env,
                "announcementBanner",
                `announcement-${item.id}`,
                fields,
                item.status === "live"
            );

            console.log(`   ✅ Announcement "${item.title}" migrated.`);

        } catch (err) {
            console.error(`   🛑 Error migrating announcement "${item.title}":`, err.message);
        }
    }
}
