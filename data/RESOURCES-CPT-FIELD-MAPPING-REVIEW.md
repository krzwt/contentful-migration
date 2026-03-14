# resources-cpt.json → Contentful field mapping review

Review of **resources-cpt.json** source fields vs **resourcesCpt** and **resourcesFields** (and **resourceWebinarFields**) in Contentful.  
Any field not listed as mapped is missing or only partially mapped.

---

## 1. Main entry: resourcesCpt (Resources CPT)

| Contentful field | Source (resources-cpt.json) | Mapped? |
|-----------------|-----------------------------|--------|
| entryId | `id` | ✅ Yes |
| title | `title` | ✅ Yes |
| slug | `uri` or `slug` | ✅ Yes |
| postDate | `postDate` | ✅ Yes |
| resourceType | `typeId` (+ fallback from `generalCategories`) | ✅ Yes |
| resourcesFields | Link to resourcesFields entry (built from item) | ✅ Yes |
| sections | `mixedContent` → component entries | ✅ Yes |
| seo | `seoMetaTags` → getOrCreateSeo | ✅ Yes |
| resourceWebinarFields | `webcastInfo` when typeId = 23 (Webinars) | ✅ Yes |

### Note

- **resourceWebinarFields** is set when the resource is Webinars (`typeId === 23`) and has `webcastInfo`. A **resourceWebinarFields** entry is created with `blockName` and `webcastInfo` (array of links to webcastInfo entries), then linked on the main entry.

---

## 2. Linked entry: resourcesFields (Resources Fields)

| Contentful field | Source (resources-cpt.json) | Mapped? |
|-----------------|-----------------------------|--------|
| resourceTitle | `resourceTitle` or `title` | ✅ Yes |
| resourceDescription | `resourceDescription` | ✅ Yes |
| signup | `signupRequired` | ✅ Yes |
| salesforceCampaignId | `salesforceCampaignId` | ✅ Yes |
| resourceTranscript | `resourceTranscript` | ✅ Yes |
| timeOverride | `timeOverride` | ✅ Yes |
| resourceCardImage | `resourceCardImage[0]` (if asset in map) | ✅ Yes |
| resourceBannerImage | `resourceBannerImage[0]` or `resourceBannerBackground[0]` (if in map) | ✅ Yes |
| resourceDocument | `resourceDocument[0]` (if asset in map) | ✅ Yes |
| tags | `tags` → comma-separated string in tags entry, then link | ✅ Yes |
| resourceVideo | `resourceVideo[0]` | ⚠️ **Skipped** (handler sets null to avoid notResolvable; logs warning) |

### Partial / not migrated

- **resourceVideo**  
  Schema expects Link to `asset`. Handler does not set a real link (only null) to avoid publish errors when the asset is not in the map. So resource video is not migrated when the asset is missing from the asset map.

---

## 3. Linked entry: resourceWebinarFields (webinar-only)

Created when resource type is Webinars (`typeId === 23`) and `item.webcastInfo` is present. **resourcesCpt.resourceWebinarFields** links to this entry.

| Contentful field | Source | Mapped? |
|-----------------|--------|--------|
| blockName | `resourceTitle` or `title` or "Webinar" | ✅ Yes |
| webcastInfo | `item.webcastInfo` → webcastInfo entry links | ✅ Yes |
| companyLogo | — | ❌ No |
| authorsHosts | — | ❌ No |
| includeIsc2Info | — | ❌ No |
| publicEvent | — | ❌ No |
| eloquaCampaignId | — | ❌ No |
| eventStartDate | — | ❌ No |
| startDateTime | — | ❌ No |
| endDateTime | — | ❌ No |
| thirdPartyUrl | — | ❌ No |

---

## 4. Source fields in resources-cpt.json with no Contentful mapping

These exist in the JSON but are not written to Contentful (no matching field or design choice).

| Source field | Notes |
|--------------|--------|
| **expiryDate** | No expiry field on resourcesCpt in schema. |
| **authorId** | Not stored on resources CPT. |
| **ref**, **url** | Display/URL; not stored as fields. |
| **faqStructuredData** | Not mapped to a Contentful field or block. |
| **sectionId**, **contentId**, **siteId**, **uid**, **dateCreated**, **dateUpdated**, **status**, **enabled**, **archived**, **trashed**, etc. | System/Craft metadata; not part of Contentful model. |

---

## 5. Summary – missing / partial list

| Item | Status |
|------|--------|
| **resourceWebinarFields** on resourcesCpt | ✅ Mapped when typeId = 23 and webcastInfo present. |
| **resourceWebinarFields** entry (blockName, webcastInfo) | ✅ Created and linked. |
| **resourceWebinarFields** (companyLogo, authorsHosts, dates, etc.) | ❌ Not in source JSON; not mapped. |
| **resourceVideo** on resourcesFields | ⚠️ Intentionally not set when asset not in map (avoids notResolvable). |
| **expiryDate** | ❌ No Contentful field. |
| **faqStructuredData** | ❌ Not mapped. |

---

## 6. Recommendation

1. **resourceVideo**  
   Resolve video asset IDs through the asset migration/map and set the link when resolvable, or keep omitting when not in map.

2. **expiryDate / faqStructuredData**  
   Add to Contentful schema and map if needed, or document as out of scope.
