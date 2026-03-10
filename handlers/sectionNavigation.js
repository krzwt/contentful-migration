import { upsertEntry, upsertCta, makeLink, parseCraftLink, resolveInternalUrl } from "../utils/contentfulHelpers.js";

const LOCALE = "en-US";
const CONTENT_TYPE = "sectionNavigation";

/**
 * Handler: siteSection (Craft) → sectionNavigation (Contentful)
 */
export async function createOrUpdateSectionNavigation(env, blockData, assetMap = null, summary = null) {
    try {
        if (env) {
            await env.getContentType(CONTENT_TYPE);
        }
    } catch (err) {
        console.warn(`   ⚠ Component "${CONTENT_TYPE}" not found: ${err.message}. Skipping.`);
        return null;
    }

    const blockId = blockData.blockId || blockData.id || "";
    const fields = blockData.fields || blockData;

    // 1. Resolve Section URL Root & Page Link
    let sectionUrlRootText = "";
    let sectionPageLink = null;
    if (fields.sectionUrlRoot) {
        const urlRootLink = parseCraftLink(fields.sectionUrlRoot);
        sectionUrlRootText = urlRootLink.url;
        if (!sectionUrlRootText && urlRootLink.linkedId) {
            sectionUrlRootText = resolveInternalUrl(urlRootLink.linkedId) || "";
        }

        // Fallback if URL root is still empty but required
        if (!sectionUrlRootText) {
            sectionUrlRootText = "/";
            console.log(`   ⚠️ sectionUrlRoot resolution failed for block ${blockId}, using fallback "/"`);
        }
        if (urlRootLink.linkedId) {
            // Check if we can find this entry in Contentful (this is handled by many of our helpers but here we might just want to store the ID for now or use a link if we have the entry ID)
            // But upsertCta does the lookup. For a direct reference field, we might need a helper.
            // For now, let's try to find if it's already a migrated page.
            // However, the sectionNavigation content type has sectionPageLink as a Reference.

            // We'll try to find the entry ID in Contentful.
            if (env) {
                try {
                    const pageTypes = [
                        "newStandaloneContent",
                        "newStandaloneMicrosite",
                        "newStandaloneThankYou",
                        "newStandaloneConversion",
                        "newPartners",
                        "newSt",
                        "newStBtu",
                        "page"
                    ];
                    for (const type of pageTypes) {
                        try {
                            const entries = await env.getEntries({
                                content_type: type,
                                "fields.entryId": String(urlRootLink.linkedId),
                                limit: 1
                            });
                            if (entries.items.length > 0) {
                                sectionPageLink = makeLink(entries.items[0].sys.id);
                                break;
                            }
                        } catch (e) {
                            // Silently skip if the content type doesn't have entryId (422)
                            const errorMsg = typeof e === 'string' ? e : (e.message || "");
                            const isMissingField = (e.status === 422) || errorMsg.includes("entryId") || errorMsg.includes("422");
                            if (!isMissingField) {
                                console.warn(`   ⚠️ Error querying ${type} for ${urlRootLink.linkedId}: ${errorMsg}`);
                            }
                        }
                    }
                } catch (e) {
                    console.warn(`   ⚠️ Could not resolve sectionPageLink for ${urlRootLink.linkedId}: ${e.message}`);
                }
            }
        }
    }

    // 2. Process "links" -> "addLinks" (many CTAs)
    const addLinks = [];
    const sourceLinks = fields.links || {};
    const linkIds = Object.keys(sourceLinks).sort((a, b) => parseInt(a) - parseInt(b));

    for (const linkId of linkIds) {
        const linkData = sourceLinks[linkId];
        const lFields = linkData.fields || linkData;
        const linkInfo = parseCraftLink(lFields.destination);
        const label = lFields.label || linkInfo.label || "Learn More";
        let url = linkInfo.url;

        const linkEntryFields = {
            label: { [LOCALE]: label }
        };

        if (linkInfo.linkedId) {
            // For sectionNavigationLinks, pageLink is a reference
            // Here we'd ideally resolve the page ID. 
            // Since we don't have a simple async way to resolve any entry by craft ID here without extra lookups,
            // we'll try to find it or at least set the external URL as fallback.

            // Re-using the page lookup logic or similar
            let linkedPageId = null;
            try {
                const pageTypes = ["newStandaloneContent", "newStandaloneMicrosite", "newStandaloneThankYou", "newStandaloneConversion", "newPartners", "newSt", "newStBtu", "page"];
                for (const type of pageTypes) {
                    try {
                        const entries = await env.getEntries({
                            content_type: type,
                            "fields.entryId": String(linkInfo.linkedId),
                            limit: 1
                        });
                        if (entries.items.length > 0) {
                            linkedPageId = entries.items[0].sys.id;
                            break;
                        }
                    } catch (e) {
                        // Skip if field missing
                    }
                }
            } catch (e) { }

            if (linkedPageId) {
                linkEntryFields.pageLink = { [LOCALE]: makeLink(linkedPageId) };
            } else if (url) {
                linkEntryFields.externalUrl = { [LOCALE]: url };
            }
        } else if (url) {
            linkEntryFields.externalUrl = { [LOCALE]: url };
        }

        const linkEntry = await upsertEntry(env, "sectionNavigationLinks", `secnav-link-${linkId}`, linkEntryFields);
        if (linkEntry) {
            addLinks.push(makeLink(linkEntry.sys.id));
        }
    }

    // 3. Process "cta" -> "cta" (single CTA)
    let ctaEntryLink = null;
    const rawCta = fields.cta;
    if (rawCta) {
        const ctaItemKey = Object.keys(rawCta)[0];
        if (ctaItemKey) {
            const ctaData = rawCta[ctaItemKey];
            const cFields = ctaData.fields || ctaData;
            const ctaInfo = parseCraftLink(cFields.destination);
            const label = cFields.label || ctaInfo.label;
            let url = ctaInfo.url;

            if (url || label || ctaInfo.linkedId) {
                // The 'cta' field on sectionNavigation takes a regular 'cta' entry? 
                // Let's check schema: yes, it says "cta" content type.
                const ctaEntry = await upsertCta(env, `secnav-cta-${ctaItemKey}`, label, url, true, ctaInfo.linkedId);
                if (ctaEntry) {
                    ctaEntryLink = makeLink(ctaEntry.sys.id);
                }
            }
        }
    }

    // 4. Process "icon" -> "icon" (Media)
    let iconLink = null;
    if (fields.icon && fields.icon.length > 0 && assetMap) {
        const assetId = String(fields.icon[0]);
        const assetInfo = assetMap.get(assetId);
        if (assetInfo) {
            iconLink = { sys: { type: "Link", linkType: "Asset", id: assetInfo.id } };
        }
    }

    const sectionNameStr = fields.sectionName || "";
    if (!sectionNameStr) {
        console.warn(`   ⚠️ sectionName is empty for block ${blockId}. Contentful will reject this.`);
    }

    const cfFields = {
        sectionName: { [LOCALE]: sectionNameStr },
        sectionUrlRoot: { [LOCALE]: sectionUrlRootText || "/" },
        addLinks: { [LOCALE]: addLinks }
    };

    if (sectionPageLink) cfFields.sectionPageLink = { [LOCALE]: sectionPageLink };
    if (ctaEntryLink) cfFields.cta = { [LOCALE]: ctaEntryLink };
    if (iconLink) cfFields.icon = { [LOCALE]: iconLink };

    console.log(`   📝 Section Navigation [${blockId}] fields: Name="${sectionNameStr}", Root="${sectionUrlRootText}"`);

    const result = await upsertEntry(env, CONTENT_TYPE, `secnav-${blockId}`, cfFields);

    return result;
}
