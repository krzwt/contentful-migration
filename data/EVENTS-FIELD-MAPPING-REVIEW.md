# events.json → Contentful Events CPT – Field Mapping Review

## Source: `data/events.json` (Craft event entries)  
## Target: `eventsCpt` + layout types (`eventConferencesType` | `eventUserGroups` | `eventVirtualEventszoom`)

---

## Mapped (Craft → Contentful)

### Main event (eventsCpt)

| Craft field | Contentful field | Notes |
|-------------|------------------|--------|
| `id` | `entryId` | String |
| `title` | `title` | |
| `uri` / `slug` | `slug` | Prefer `uri` |
| `postDate` | `postDate` | |
| `typeId` | `entryType` | 51→Conferences, 50→User Groups, 100→Virtual Events(Zoom) |
| `eventStartDate` | `eventStartDate` | |
| `eventEndDate` | `eventEndDate` | |
| `timezone` | `timezone` | Via TIMEZONE_MAP |
| `region` | `region` | Normalized (north-america→North America, etc.) |
| `publicEvent` | `publicEvent` | Boolean |
| `newEventPageBanner` (image) | `bannerImage` | With fallback from resourceCardImage / image |
| `newEventPageBanner` (heading, subheading, body) | `bannerHeading`, `bannerSubheading`, `bannerBody` | bannerBody truncated to 255 chars |
| `newEventPageBanner` (cta) | `bannerCta` | CTA entry via parseCraftLink + upsertCta |
| `resourceCardImage` | `resourceCardImage` | Asset link |
| `image` | `alternativeListingThumbnail` | Asset link |
| `sectionNavigation` | `sectionNavigation` | Section navigation entry (if present) |
| `seoMetaTags` | `seo` | Via getOrCreateSeo (metaGlobalVars) |
| Layout sub-entry | `eventTypeLayoutFields` | Link to eventConferencesType / eventUserGroups / eventVirtualEventszoom |
| `eventAgenda` | `eventAgenda` | Array of eventAgendaItem links |
| `mixedContent` | `sections` | Modular blocks → coverPhotoSection, mediaBlock, contentBlock, etc. |
| `generalCategories` | `metadata.concepts` | Taxonomy; default "useCases" if none |

### Layout – Conferences (eventConferencesType), User Groups (eventUserGroups)

| Craft field | Contentful layout field | Notes |
|-------------|-------------------------|--------|
| `location` (first block fields) | `eventLocationName`, `streetAddress`, `city`, `stateProvince`, `country` | Only when typeId 51 or 50 |
| `eventPartnerLogo` | `partnerLogo` | Asset links; only when typeId 51 or 50 |
| `textContent` | `textContent` | RichText; Conferences only (typeId 51) |
| `emailEventManager` | `emailLeadNotificationsToEventManager` | User Groups / Virtual |
| `salesforceCampaignId` | `salesforceCampaignId` | User Groups / Virtual |
| `meetingUrl` | `meetingUrl` | User Groups / Virtual |
| `registrationCutoffDate` | `registrationCutoffDate` | User Groups / Virtual |
| `closeRegistration` | `closeRegistration` | User Groups / Virtual |
| `redirectUrl` | `redirectUrl` | CTA link; User Groups / Virtual |

### Layout – Virtual Events (eventVirtualEventszoom)

Only: `emailLeadNotificationsToEventManager`, `salesforceCampaignId`, `meetingUrl`, `registrationCutoffDate`, `closeRegistration`, `redirectUrl`. No `city`, `country`, or `partnerLogo` (schema does not have those fields).

### Event agenda (eventAgendaItem)

| Craft agenda block fields | Contentful eventAgendaItem |
|----------------------------|-----------------------------|
| `eventStartDate`, `eventEndDate` | `eventStartDate`, `eventEndDate` |
| `sessionTitle` | `sessionTitle` |
| `description` | `shortDescription` (first 140 chars) |
| `longDescription` | `longDescription` (RichText) |
| `speakers` | `speakers` (links to person-{id}) |

---

## Not mapped / no Contentful equivalent

| Craft field | Reason |
|-------------|--------|
| `eventManager` | Layout types may have “Event Manager” as Link to users; not currently mapped. eventsCpt in schema has no eventManager field. |
| `expiryDate` | Not present on eventsCpt in schema. |
| `prebuiltOptionalFields` | Form config; no matching eventsCpt/layout field. |
| `additionalFormFields` | Form config; no matching eventsCpt/layout field. |
| `faqStructuredData` | Exists on some other Contentful type; not on eventsCpt in reviewed schema. |
| `sectionId`, `contentId`, `uid`, `ref`, `url`, `authorId`, `dateCreated`, `dateUpdated`, etc. | System/internal; not content fields. |

---

## Summary

- All **content** fields used on the front (title, slug, dates, timezone, region, banner, CTA, agenda, sections, SEO, layout-specific fields) are mapped.
- **eventManager** and **expiryDate** are not mapped; add only if Contentful schema has corresponding fields (e.g. Event Manager link, Expiry date).
- **prebuiltOptionalFields**, **additionalFormFields**, and **faqStructuredData** have no matching eventsCpt/layout fields in the current schema; map only if you add those fields in Contentful.
