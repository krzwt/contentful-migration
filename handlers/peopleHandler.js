import { LOCALE, safeId } from "./pageHandler.js";
import { upsertEntry, makeLink } from "../utils/contentfulHelpers.js";
import { convertHtmlToRichText } from "../utils/richText.js";

/**
 * Main function to migrate People entries
 */
export async function migratePeople(env, peopleData, assetMap = null, targetIndices = null, totalPages = null, summary = null) {
    const total = targetIndices ? targetIndices[targetIndices.length - 1] + 1 : (totalPages || peopleData.length);
    console.log(`\n👥 Starting People Migration (${peopleData.length} entries)...`);

    for (let i = 0; i < peopleData.length; i++) {
        const person = peopleData[i];
        const personName = person.title || person.personsName || "Unknown Person";
        const pageNum = targetIndices ? targetIndices[i] + 1 : i + 1;
        const progress = `[${pageNum} / ${total}]`;
        const shouldPublish = person.status === "live";
        console.log(`\n➡️ ${progress} Person: ${personName} (ID: ${person.id}, Status: ${person.status})`);

        try {
            // 1. Handle Nested Entries First (Inherit publish status)
            const socialLinkIds = await processSocialLinks(env, person, shouldPublish);
            const contactInfoIds = await processContactInfo(env, person, shouldPublish);
            const otherLinkIds = await processOtherLinks(env, person, shouldPublish);

            // 2. Prepare Fields (personsBiography is Rich Text in Contentful)
            const biographyRaw = (person.personsBiography || "").trim();
            const biographyHtml = biographyRaw
                ? "<p>" + cleanHtml(biographyRaw).replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br/>") + "</p>"
                : "<p></p>";
            const biographyRich = await convertHtmlToRichText(env, biographyHtml);

            const fields = {
                entryId: { [LOCALE]: String(person.id) },
                title: { [LOCALE]: person.title || person.personsName || "Unknown Person" },
                personsName: { [LOCALE]: person.personsName || "" },
                personsTitle: { [LOCALE]: person.personsTitle || "" },
                personsBiography: { [LOCALE]: biographyRich },
            };

            // 3. Handle Photo (Media)
            if (person.personsPhoto && person.personsPhoto[0]) {
                const craftAssetId = String(person.personsPhoto[0]);
                let contentfulAssetId = `asset-${craftAssetId}`;

                // If we have a mapped ID (from asset scan), use it
                if (assetMap && assetMap.has(craftAssetId)) {
                    contentfulAssetId = assetMap.get(craftAssetId).id;
                }

                fields.personsPhoto = {
                    [LOCALE]: { sys: { type: "Link", linkType: "Asset", id: contentfulAssetId } }
                };
            }

            // 4. Link Nested Entries
            if (socialLinkIds.length > 0) {
                fields.socialMediaLinks = { [LOCALE]: socialLinkIds.map(id => makeLink(id)) };
            }
            if (contactInfoIds.length > 0) {
                fields.contactInfo = { [LOCALE]: contactInfoIds.map(id => makeLink(id)) };
            }
            if (otherLinkIds.length > 0) {
                fields.otherLinks = { [LOCALE]: otherLinkIds.map(id => makeLink(id)) };
            }

            // 5. Upsert the Person
            const contentfulId = `person-${person.id}`;
            await upsertEntry(env, "peopleCpt", contentfulId, fields, shouldPublish);
            console.log(`✅ Person "${personName}" migrated (${shouldPublish ? 'Published' : 'Draft'}).`);

        } catch (err) {
            console.error(`❌ Error migrating person "${personName}":`, err.message);
        }
    }
}

/**
 * Process Social Media Links
 */
async function processSocialLinks(env, person, shouldPublish = true) {
    const ids = [];
    if (!person.socialMediaLinks) return ids;

    const PLATFORM_MAP = {
        "linkedin": "LinkedIn",
        "twitterx": "X (Twitter)",
        "twitter": "X (Twitter)",
        "facebook": "Facebook",
        "instagram": "Instagram",
        "google": "Google",
        "youtube": "Youtube"
    };

    // socialMediaLinks is an object with IDs as keys
    const links = Object.values(person.socialMediaLinks);
    for (const linkGroup of links) {
        if (!linkGroup.fields) continue;

        for (const [platform, dataStr] of Object.entries(linkGroup.fields)) {
            try {
                const data = JSON.parse(dataStr);
                if (data.linkedUrl) {
                    const platformKey = platform.toLowerCase();
                    const safePlatform = PLATFORM_MAP[platformKey] || (platform.charAt(0).toUpperCase() + platform.slice(1));

                    const linkId = safeId(`social-${person.id}`, platform);

                    const fields = {
                        platform: { [LOCALE]: safePlatform },
                        url: { [LOCALE]: data.linkedUrl }
                    };

                    await upsertEntry(env, "socialLink", linkId, fields, shouldPublish);
                    ids.push(linkId);
                }
            } catch (e) { /* skip invalid json */ }
        }
    }
    return ids;
}

/**
 * Process Contact Info
 */
async function processContactInfo(env, person, shouldPublish = true) {
    const ids = [];
    if (!person.contactInfo) return ids;

    const contacts = Object.values(person.contactInfo);
    for (const contactGroup of contacts) {
        const fields = contactGroup.fields;
        if (!fields) continue;

        try {
            const phoneData = fields.phone ? JSON.parse(fields.phone) : null;
            const phone = phoneData ? phoneData.linkedUrl : "";
            const email = fields.email || "";

            if (phone || email) {
                const contactId = `contact-${person.id}-${contactGroup.type}`;
                const entryFields = {
                    title: { [LOCALE]: `Contact: ${person.title || person.personsName || "Unknown"}` },
                    phone: { [LOCALE]: phone },
                    email: { [LOCALE]: email }
                };
                await upsertEntry(env, "contactInfo", contactId, entryFields, shouldPublish);
                ids.push(contactId);
            }
        } catch (e) { /* skip */ }
    }
    return ids;
}

/**
 * Process Other Links (CTAs)
 */
async function processOtherLinks(env, person, shouldPublish = true) {
    // Currently empty in sample, but ready for logic if needed
    return [];
}

/**
 * Helper to clean HTML tags for a Markdown field
 */
function cleanHtml(html) {
    return html
        .replace(/<p>/g, "")
        .replace(/<\/p>/g, "\n\n")
        .replace(/<br\s*\/?>/g, "\n")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .trim();
}
