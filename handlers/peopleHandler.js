import { LOCALE, safeId } from "./pageHandler.js";
import { upsertEntry, makeLink } from "../utils/contentfulHelpers.js";

/**
 * Main function to migrate People entries
 */
export async function migratePeople(env, peopleData, assetMap = null) {
    console.log(`\n👥 Starting People Migration (${peopleData.length} entries)...`);

    for (let i = 0; i < peopleData.length; i++) {
        const person = peopleData[i];
        const progress = `[${i + 1} / ${peopleData.length}]`;
        console.log(`\n➡️ ${progress} Person: ${person.title} (ID: ${person.id})`);

        try {
            // 1. Handle Nested Entries First
            const socialLinkIds = await processSocialLinks(env, person);
            const contactInfoIds = await processContactInfo(env, person);
            const otherLinkIds = await processOtherLinks(env, person);

            // 2. Prepare Fields
            const fields = {
                entryId: { [LOCALE]: String(person.id) },
                title: { [LOCALE]: person.title },
                personsName: { [LOCALE]: person.personsName || "" },
                personsTitle: { [LOCALE]: person.personsTitle || "" },
                // Biography: Clean HTML slightly for Long Text (Markdown)
                personsBiography: { [LOCALE]: cleanHtml(person.personsBiography || "") },
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
            await upsertEntry(env, "peopleCpt", contentfulId, fields);
            console.log(`✅ Person "${person.title}" migrated.`);

        } catch (err) {
            console.error(`❌ Error migrating person "${person.title}":`, err.message);
        }
    }
}

/**
 * Process Social Media Links
 */
async function processSocialLinks(env, person) {
    const ids = [];
    if (!person.socialMediaLinks) return ids;

    // socialMediaLinks is an object with IDs as keys
    const links = Object.values(person.socialMediaLinks);
    for (const linkGroup of links) {
        if (!linkGroup.fields) continue;

        for (const [platform, dataStr] of Object.entries(linkGroup.fields)) {
            try {
                const data = JSON.parse(dataStr);
                if (data.linkedUrl) {
                    const safePlatform = platform.charAt(0).toUpperCase() + platform.slice(1);
                    const linkId = safeId(`social-${person.id}`, platform);

                    const fields = {
                        platform: { [LOCALE]: safePlatform },
                        url: { [LOCALE]: data.linkedUrl }
                    };

                    await upsertEntry(env, "socialLink", linkId, fields);
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
async function processContactInfo(env, person) {
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
                    title: { [LOCALE]: `Contact: ${person.title}` },
                    phone: { [LOCALE]: phone },
                    email: { [LOCALE]: email }
                };
                await upsertEntry(env, "contactInfo", contactId, entryFields);
                ids.push(contactId);
            }
        } catch (e) { /* skip */ }
    }
    return ids;
}

/**
 * Process Other Links (CTAs)
 */
async function processOtherLinks(env, person) {
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
