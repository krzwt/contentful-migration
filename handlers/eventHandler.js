import { LOCALE, getOrCreateSeo, publishPage } from "./pageHandler.js";
import { upsertEntry, upsertCta, makeLink, parseCraftLink, upsertAssetWrapper } from "../utils/contentfulHelpers.js";
import { COMPONENTS } from "../registry.js";
import { convertHtmlToRichText } from "../utils/richText.js";

const TIMEZONE_MAP = {
    "UTC": "Universal Time Coordinated (UTC/GMT)",
    "Universal Time Coordinated (UTC/GMT)": "Universal Time Coordinated (UTC/GMT)",
    "Africa/Casablanca": "Africa/Casablanca (+01)",
    "Africa/Johannesburg": "Africa/Johannesburg (SAST)",
    "Africa/Lagos": "Africa/Lagos (WAT)",
    "Africa/Nairobi": "Africa/Nairobi (EAT)",
    "Africa/Tunis": "Africa/Tunis (CET)",
    "America/Argentina/Buenos_Aires": "America/Argentina/Buenos_Aires (AGT)",
    "America/Chicago": "America/Chicago (CT/CST/CDT)",
    "America/Edmonton": "America/Edmonton (MST/MDT)",
    "America/Los_Angeles": "America/Los_Angeles (PT/PST/PDT)",
    "America/New_York": "America/New_York (ET/EST/EDT)",
    "America/Phoenix": "America/Phoenix (MT/MST/MDT)",
    "America/Halifax": "America/Halifax (AST/ADT)",
    "America/Sao_Paulo": "America/Sao_Paulo (BRT)",
    "America/Mexico_City": "America/Mexico_City (CT/CST/CDT)",
    "America/Bogota": "America/Bogota (COT)",
    "Asia/Bangkok": "Asia/Bangkok (ICT)",
    "Asia/Dubai": "Asia/Dubai (GST)",
    "Asia/Jakarta": "Asia/Jakarta (WIB)",
    "Asia/Jerusalem": "Asia/Jerusalem (IST)",
    "Asia/Manila": "Asia/Manila (PST)",
    "Asia/Makassar": "Asia/Makassar (WITA)",
    "Asia/Qatar": "Asia/Qatar (AST)",
    "Asia/Riyadh": "Asia/Riyadh (AST)",
    "Asia/Seoul": "Asia/Seoul (KST)",
    "Asia/Singapore": "Asia/Singapore (SST/SGT)",
    "Asia/Tehran": "Asia/Tehran (IRDT)",
    "Australia/Sydney": "Australia/Sydney (AET/AEST/AEDT)",
    "Europe/Lisbon": "Europe/Lisbon (WET)",
    "Europe/Paris": "Europe/Paris (CET, CEST)",
    "Europe/Sofia": "Europe/Sofia (EET)",
    "Europe/London": "Europe/London (BST)",
    "Asia/Kolkata": "Asia/Kolkata (IST)",
    "Indian/Mauritius": "Indian/Mauritius (MUT)",
    "Pacific/Auckland": "Pacific/Auckland"
};

/**
 * Handler for Events CPT migration
 */
export async function migrateEvents(
    env,
    data,
    assetMap = null,
    targetIndices = null,
    totalPages = null,
    summary = null,
    rawFileContent = null
) {
    const total = targetIndices
        ? targetIndices[targetIndices.length - 1] + 1
        : totalPages || data.length;
    console.log(`\n📅 Starting Events Migration (${data.length} entries)...`);

    for (let i = 0; i < data.length; i++) {
        const item = data[i];
        const pageNum = targetIndices ? targetIndices[i] + 1 : i + 1;
        const progress = `[${pageNum} / ${total}]`;
        const shouldPublish = item.status === "live";

        console.log(`\n➡️ ${progress} Event: ${item.title} (ID: ${item.id})`);

        try {
            // 1. Create SEO
            const seoEntry = await getOrCreateSeo(env, item, assetMap);

            // 2. Prepare Layout Sub-entry (Conferences / User Groups / Virtual Events)
            let layoutEntry = null;
            let entryTypeLabel = "User Groups";
            if (item.typeId === 51) entryTypeLabel = "Conferences";
            else if (item.typeId === 100) entryTypeLabel = "Virtual Events(Zoom)";
            else if (item.typeId === 50) entryTypeLabel = "User Groups";

            const layoutFields = {};

            // Map Location fields if present
            if (item.location && typeof item.location === 'object' && !Array.isArray(item.location)) {
                const locationKeys = Object.keys(item.location);
                if (locationKeys.length > 0) {
                    const loc = item.location[locationKeys[0]].fields;
                    layoutFields.eventLocationName = { [LOCALE]: loc.eventLocationName || "" };
                    layoutFields.streetAddress = { [LOCALE]: loc.streetAddress || "" };
                    layoutFields.city = { [LOCALE]: loc.city || "Virtual" }; // Required in eventUserGroups
                    layoutFields.stateProvince = { [LOCALE]: loc.state || "" };
                    
                    // Normalize country to match Contentful validation list if possible
                    // Contentful expects values like "USA", "United Kingdom", "Asia", etc.
                    let country = loc.country || "USA";
                    if (country === "United States") country = "USA";
                    layoutFields.country = { [LOCALE]: country }; 
                } else {
                    // Fallback for missing location but required fields
                    layoutFields.city = { [LOCALE]: "Virtual" };
                    layoutFields.country = { [LOCALE]: "USA" };
                }
            } else {
                // Fallback for missing location property
                layoutFields.city = { [LOCALE]: "Virtual" };
                layoutFields.country = { [LOCALE]: "USA" };
            }

            // Map Partner Logos
            if (item.eventPartnerLogo && item.eventPartnerLogo.length > 0) {
                const logoLinks = item.eventPartnerLogo.map(id => {
                    const am = assetMap.get(String(id));
                    return am ? makeLink(am.id, "Asset") : null;
                }).filter(Boolean);
                if (logoLinks.length > 0) {
                    layoutFields.partnerLogo = { [LOCALE]: logoLinks };
                }
            }

            if (item.typeId === 51) {
                // Conferences specific: textContent
                const contentHtml = item.textContent || "";
                if (contentHtml && env) {
                    layoutFields.textContent = { [LOCALE]: await convertHtmlToRichText(env, contentHtml) };
                }
                layoutEntry = await upsertEntry(env, "eventConferencesType", `event-layout-${item.id}`, layoutFields, shouldPublish);
            } else {
                // User Groups or Virtual Events: extra fields
                layoutFields.emailLeadNotificationsToEventManager = { [LOCALE]: !!item.emailEventManager };
                layoutFields.salesforceCampaignId = { [LOCALE]: item.salesforceCampaignId || "N/A" }; // Required in these models
                layoutFields.meetingUrl = { [LOCALE]: item.meetingUrl || "" };
                if (item.registrationCutoffDate) {
                    layoutFields.registrationCutoffDate = { [LOCALE]: item.registrationCutoffDate };
                }
                layoutFields.closeRegistration = { [LOCALE]: !!item.closeRegistration };

                // Redirect URL (cta)
                if (item.redirectUrl) {
                    const linkInfo = parseCraftLink(item.redirectUrl);
                    if (linkInfo.url || linkInfo.label) {
                        const ctaEntry = await upsertCta(env, `event-redirect-${item.id}`, linkInfo.label, linkInfo.url, shouldPublish, linkInfo.linkedId);
                        if (ctaEntry) layoutFields.redirectUrl = { [LOCALE]: makeLink(ctaEntry.sys.id) };
                    }
                }

                const layoutCT = item.typeId === 100 ? "eventVirtualEventszoom" : "eventUserGroups";
                layoutEntry = await upsertEntry(env, layoutCT, `event-layout-${item.id}`, layoutFields, shouldPublish);
            }

            // ⚠️ Map mixedContent (modular blocks) to the new 'sections' field
            const sectionEntries = [];
            if (item.mixedContent && typeof item.mixedContent === 'object' && !Array.isArray(item.mixedContent)) {
                // Better extraction of segment from raw content
                const pId = String(item.id);
                const mcIdx = rawFileContent ? rawFileContent.indexOf(`"id": ${pId}`) : -1;
                const mcSegment = mcIdx !== -1 ? rawFileContent.substring(mcIdx) : "";
                
                const blockIds = Object.keys(item.mixedContent);
                for (const blockId of blockIds) {
                    const block = item.mixedContent[blockId];
                    if (!block.enabled) continue;

                    const blockType = block.type;
                    const fields = block.fields || {};

                    // Handle mapping for restricted 'sections' allowed types (coverPhotoSection, mediaBlock, events)
                    let targetCT = null;
                    if (blockType === "pageSection" || blockType === "stackedPhotoBlock") targetCT = "coverPhotoSection";
                    else if (blockType === "contentBlock" || blockType === "mediaBlock") targetCT = "mediaBlock";

                    try {
                        let entry = null;
                        const bIdx = mcSegment.indexOf(`"${blockId}":`);
                        const nextBIdx = mcSegment.indexOf(`"id":`, bIdx + 20);
                        const blockSegment = mcSegment.substring(bIdx, nextBIdx === -1 ? undefined : nextBIdx);

                        if (targetCT === "coverPhotoSection") {
                            const cpFields = {
                                blockId: { [LOCALE]: blockId },
                                blockName: { [LOCALE]: fields.headingSection || `Section ${blockId}` },
                                heading: { [LOCALE]: fields.headingSection || "" },
                                subheading: { [LOCALE]: fields.subheading || "" },
                                bodyText: { [LOCALE]: fields.bodyRedactorRestricted || fields.body || "" }
                            };
                            if (fields.backgroundImage?.[0]) {
                                const am = assetMap?.get(String(fields.backgroundImage[0]));
                                if (am) cpFields.backgroundImage = { [LOCALE]: makeLink(am.id, "Asset") };
                            }
                            entry = await upsertEntry(env, "coverPhotoSection", `cp-${blockId}`, cpFields, shouldPublish);
                        } else if (targetCT === "mediaBlock") {
                            // Convert pageContent (Craft) to Media Block (Contentful)
                            const config = COMPONENTS["mediaBlock"];
                            entry = await config.handler(env, {
                                blockId,
                                blockSegment,
                                ...fields,
                                blockName: fields.headingSection || fields.blockHeading || `Media ${blockId}`,
                                heading: fields.headingSection || fields.blockHeading || "",
                                description: fields.body || fields.blockBody || fields.description || "",
                                asset: fields.mediaAsset || fields.image || fields.asset || []
                            }, assetMap, summary);
                        } else {
                            const config = COMPONENTS[blockType];
                            if (config) {
                                entry = await config.handler(env, {
                                    blockId,
                                    blockSegment,
                                    ...fields,
                                    heading: fields.blockHeading || fields.headingSection || fields.heading || "",
                                    body: fields.blockBody || fields.body || fields.description || "",
                                    variation: blockType
                                }, assetMap, summary);
                            }
                        }

                        if (entry) {
                            if (Array.isArray(entry)) {
                                sectionEntries.push(...entry.map(e => makeLink(e.sys.id)));
                            } else {
                                sectionEntries.push(makeLink(entry.sys.id));
                            }
                        }
                    } catch (err) {
                        console.error(`   🛑 Error processing modular block ${blockType} (${blockId}):`, err.message);
                    }
                }
            }

            // 3. Create Agenda Items
            const agendaLinks = [];
            if (item.eventAgenda && typeof item.eventAgenda === 'object' && !Array.isArray(item.eventAgenda)) {
                const agendaIds = Object.keys(item.eventAgenda);
                for (const agendaId of agendaIds) {
                    const agenda = item.eventAgenda[agendaId].fields;
                    const agendaFields = {
                        eventStartDate: { [LOCALE]: agenda.eventStartDate || null },
                        eventEndDate: { [LOCALE]: agenda.eventEndDate || null },
                        sessionTitle: { [LOCALE]: agenda.sessionTitle || "Untitled Session" },
                        shortDescription: { [LOCALE]: (agenda.description || "").substring(0, 140) }
                    };
                    if (agenda.longDescription && env) {
                        agendaFields.longDescription = { [LOCALE]: await convertHtmlToRichText(env, agenda.longDescription) };
                    }
                    if (agenda.speakers && agenda.speakers.length > 0) {
                        // Speaker IDs are often Craft IDs, we map them to BTU Person entries
                        const speakerLinks = agenda.speakers.map(id => makeLink(`person-${id}`)).filter(Boolean);
                        if (speakerLinks.length > 0) agendaFields.speakers = { [LOCALE]: speakerLinks };
                    }
                    const agendaEntry = await upsertEntry(env, "eventAgendaItem", `agenda-${agendaId}`, agendaFields, shouldPublish);
                    if (agendaEntry) agendaLinks.push(makeLink(agendaEntry.sys.id));
                }
            }

            // 4. Create Main Event Entry (eventsCpt)
            const banner = item.newEventPageBanner && typeof item.newEventPageBanner === 'object' ? Object.values(item.newEventPageBanner)[0] : null;

            const mainFields = {
                entryId: { [LOCALE]: String(item.id) },
                title: { [LOCALE]: item.title || "" },
                slug: { [LOCALE]: item.uri || item.slug || "" },
                entryType: { [LOCALE]: entryTypeLabel },
                postDate: { [LOCALE]: item.postDate || null },
                eventStartDate: { [LOCALE]: item.eventStartDate || null },
                eventEndDate: { [LOCALE]: item.eventEndDate || null },
                timezone: { [LOCALE]: TIMEZONE_MAP[item.timezone] || item.timezone || "America/New_York" },
                publicEvent: { [LOCALE]: !!item.publicEvent },
                bannerHeading: { [LOCALE]: banner?.fields?.heading || "" },
                bannerSubheading: { [LOCALE]: banner?.fields?.subheading || "" },
                bannerBody: { [LOCALE]: (banner?.fields?.body || "").substring(0, 255) }
            };

            // Region normalization
            if (item.region && item.region.length > 0) {
                const regionMap = {
                    "north-america": "North America",
                    "latin-america": "Latin America",
                    "emea": "EMEA",
                    "apj": "APJ"
                };
                const rawRegion = String(item.region[0]).toLowerCase();
                const mappedRegion = regionMap[rawRegion] || "APJ";
                mainFields.region = { [LOCALE]: mappedRegion };
            }

            // Banner Image (REQUIRED by schema)
            let bannerAssetId = null;
            if (banner?.fields?.image?.[0]) {
                const am = assetMap?.get(String(banner.fields.image[0]));
                if (am) bannerAssetId = am.id;
            }

            // Fallback for bannerImage if required field is missing
            if (!bannerAssetId) {
                const fallbackIds = [
                    ...(item.resourceCardImage || []),
                    ...(item.image || [])
                ];
                for (const fId of fallbackIds) {
                    const am = assetMap?.get(String(fId));
                    if (am) {
                        bannerAssetId = am.id;
                        console.log(`   ℹ️ Fallback bannerImage for ${item.id} using asset ${fId}`);
                        break;
                    }
                }
            }

            if (bannerAssetId) {
                mainFields.bannerImage = { [LOCALE]: makeLink(bannerAssetId, "Asset") };
            } else {
                console.warn(`   ⚠️ bannerImage is MISSING for Event ${item.id} (${item.title}), and no fallback found. Publish will likely fail.`);
            }

            // Banner CTA
            if (banner?.fields?.cta && typeof banner.fields.cta === 'object' && Object.keys(banner.fields.cta).length > 0) {
                const ctaData = Object.values(banner.fields.cta)[0];
                const linkInfo = parseCraftLink(ctaData.fields.destination);
                const ctaEntry = await upsertCta(env, `event-banner-cta-${item.id}`, ctaData.fields.text || linkInfo.label, linkInfo.url, shouldPublish, linkInfo.linkedId);
                if (ctaEntry) mainFields.bannerCta = { [LOCALE]: makeLink(ctaEntry.sys.id) };
            }

            // Resource Card Image
            if (item.resourceCardImage?.[0]) {
                const am = assetMap?.get(String(item.resourceCardImage[0]));
                if (am) mainFields.resourceCardImage = { [LOCALE]: makeLink(am.id, "Asset") };
            }
            
            // Top level image -> alternativeListingThumbnail
            if (item.image?.[0]) {
                const am = assetMap?.get(String(item.image[0]));
                if (am) mainFields.alternativeListingThumbnail = { [LOCALE]: makeLink(am.id, "Asset") };
            }

            // Section Navigation
            if (item.sectionNavigation && typeof item.sectionNavigation === 'object' && !Array.isArray(item.sectionNavigation)) {
                const secNavKeys = Object.keys(item.sectionNavigation);
                if (secNavKeys.length > 0) {
                    const blockId = secNavKeys[0];
                    const block = item.sectionNavigation[blockId];
                    if (block.enabled) {
                        const config = COMPONENTS["sectionNavigation"];
                        if (config) {
                            const secNavEntry = await config.handler(env, { 
                                blockId, 
                                ...block.fields,
                                label: block.fields.label || block.fields.ctaLinkText,
                                variation: "sectionNavigation"
                            }, assetMap, summary);
                            if (secNavEntry) {
                                mainFields.sectionNavigation = { [LOCALE]: makeLink(Array.isArray(secNavEntry) ? secNavEntry[0].sys.id : secNavEntry.sys.id) };
                            }
                        }
                    }
                }
            }

            if (seoEntry) mainFields.seo = { [LOCALE]: makeLink(seoEntry.sys.id) };
            if (layoutEntry) mainFields.eventTypeLayoutFields = { [LOCALE]: makeLink(layoutEntry.sys.id) };
            if (agendaLinks.length > 0) mainFields.eventAgenda = { [LOCALE]: agendaLinks };
            if (sectionEntries.length > 0) mainFields.sections = { [LOCALE]: sectionEntries };

            const mainEntry = await upsertEntry(env, "eventsCpt", `event-${item.id}`, mainFields, shouldPublish);

            if (mainEntry && shouldPublish) {
                await publishPage(env, mainEntry, item);
            }

            console.log(`✅ Event "${item.title}" migrated.`);

        } catch (err) {
            console.error(`❌ Error migrating Event "${item.title}":`, err.message);
        }
    }
}
