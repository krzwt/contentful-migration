import { upsertEntry, resolveInternalUrl } from "../utils/contentfulHelpers.js";

const LOCALE = "en-US";

const THEME_MAPPING = {
    shortFullBarWithImageOption: "Short Full Bar (with image option)",
    shortHalfBarNoImage: "Short Half Bar (no image)",
    longTallBarMoreText: "Long Tall Bar (more text)",
    longShortBarLessText: "Long Short Bar (less text)"
};

const TEMPLATE_MAPPING = {
    landingPages: "Page",
    newSolutions: "NewStandaloneContent",
    newStandaloneContent: "NewStandaloneContent",
    newStandaloneConversion: "NewStandaloneConversion",
    newStandaloneMicrosite: "NewStandaloneMicrosite",
    newStandaloneThankYou: "NewStandaloneThankYou"
};

/**
 * Resolves source IDs to Contentful Entry references by batching queries
 */
async function resolveTargetEntries(env, ids) {
    if (!ids || !ids.length) return [];
    if (!env) return ids.map(id => ({ sys: { type: "Link", linkType: "Entry", id: `dry-run-${id}` } })); // Handle dry run

    const pageTypes = [
        "page",
        "newStandaloneContent",
        "newStandaloneMicrosite",
        "newStandaloneThankYou",
        "newStandaloneConversion",
        "company",
        "newCompany"
    ];

    const resultsMap = new Map();
    const chunkSize = 100;

    console.log(`     🔍 Resolving ${ids.length} target entries...`);

    for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize);
        const idString = chunk.join(',');

        // Query all content types concurrently for this chunk
        const promises = pageTypes.map(async (type) => {
            try {
                const res = await env.getEntries({
                    content_type: type,
                    "fields.entryId[in]": idString,
                    limit: chunk.length
                });
                if (res && res.items) {
                    for (const item of res.items) {
                        const originalId = item.fields.entryId?.['en-US'] || item.fields.entryId;
                        if (originalId) {
                            resultsMap.set(String(originalId), item.sys.id);
                        }
                    }
                }
            } catch (e) {
                // Skip if content type not found or other errors
            }
        });

        await Promise.all(promises);
    }

    const results = [];
    for (const id of ids) {
        const sysId = resultsMap.get(String(id));
        if (sysId) {
            results.push({ sys: { type: "Link", linkType: "Entry", id: sysId } });
        }
    }
    return results;
}

export async function migrateAnnouncements(env, entries, contentfulAssetMap, summary) {
    console.log(`\n🚀 Migrating ${entries.length} Announcement items...`);

    for (const item of entries) {
        const entryId = `announcement-${item.id}`;
        console.log(`   ➡️ Processing Announcement: ${item.title} (${item.id})`);

        const fields = {
            announcementTitle: { [LOCALE]: item.title || "" }
        };
        const isHeader = String(item.typeId) === "153";
        const isBottom = String(item.typeId) === "154";

        // Parse content link
        let linkUrl = "";
        if (item.contentLink) {
            try {
                const linkObj = typeof item.contentLink === "string" ? JSON.parse(item.contentLink) : item.contentLink;
                linkUrl = linkObj.linkedUrl || "";
                if (!linkUrl && linkObj.linkedId) {
                    linkUrl = resolveInternalUrl(linkObj.linkedId) || "";
                }
            } catch (e) {
                linkUrl = String(item.contentLink);
            }
        }

        if (isHeader) {
            fields.messageTop = { [LOCALE]: item.message || "" };
            fields.contentLinkTop = { [LOCALE]: linkUrl };
            fields.linkTextTop = { [LOCALE]: item.linkText || "" };
            fields.headingSection = { [LOCALE]: item.headingSection || "" };

            if (item.themeType && THEME_MAPPING[item.themeType]) {
                fields.themeType = { [LOCALE]: THEME_MAPPING[item.themeType] };
            }

            if (item.image && item.image.length > 0) {
                const assetData = contentfulAssetMap.get(String(item.image[0]));
                if (assetData) {
                    const actualAssetId = typeof assetData === "string" ? assetData : assetData.id;
                    fields.announcementImage = { [LOCALE]: { sys: { type: "Link", linkType: "Asset", id: actualAssetId } } };
                }
            }

            // Targeting for Header (Type 153)
            if (item.targeting) {
                const targetingKey = Object.keys(item.targeting)[0];
                const targeting = item.targeting[targetingKey];
                if (targeting && targeting.fields) {
                    if (targeting.fields.targetEntries) {
                        const resolved = await resolveTargetEntries(env, targeting.fields.targetEntries);
                        if (resolved.length > 0) {
                            fields.headerAnnouncementTargetEntries = { [LOCALE]: resolved };
                        }
                    }
                    if (targeting.fields.targetSection) {
                        const templates = targeting.fields.targetSection
                            .map(s => TEMPLATE_MAPPING[s])
                            .filter(Boolean);
                        if (templates.length > 0) {
                            fields.targetPageTemplates = { [LOCALE]: [...new Set(templates)] };
                        }
                    }
                }
            }
        } else if (isBottom) {
            fields.announcementBottomTitle = { [LOCALE]: item.title || "" };
            fields.message = { [LOCALE]: item.message || "" };
            fields.contentLink = { [LOCALE]: linkUrl };
            fields.linkText = { [LOCALE]: item.linkText || "" };

            // For type 154, targetEntries is top-level
            if (item.targetEntries) {
                const resolved = await resolveTargetEntries(env, item.targetEntries);
                if (resolved.length > 0) {
                    fields.bottomAnnouncementTargetEntries = { [LOCALE]: resolved };
                }
            }
        }

        // Always set modern theme to false for now unless we find a switch, but cast strictly to boolean
        const rawThemeValue = item.useModernTheme;
        const isModern = !!rawThemeValue && rawThemeValue !== "0" && String(rawThemeValue).toLowerCase() !== "false";
        fields.useModernTheme = { [LOCALE]: isModern };

        await upsertEntry(env, "announcementBanner", entryId, fields, true);
        summary.processed++;
    }

    console.log(`\n✅ Finished migrating Announcements`);
}
