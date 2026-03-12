# Press & Media (newPressMediaCpt) – Field mapping review

## Contentful schema vs `new-press&media.json`

| Contentful field        | Source in JSON                    | Status |
|-------------------------|-----------------------------------|--------|
| **entryId**             | `id`                             | ✅ Mapped |
| **title**               | `title`                          | ✅ Mapped |
| **slug**                | `slug`                           | ✅ Mapped |
| **seo**                 | `seoMetaTags` → getOrCreateSeo   | ✅ Mapped |
| **entryType**           | `typeId` → ENTRY_TYPE_MAP (147–151) | ✅ Mapped (incl. Boilerplate) |
| **abstract**            | `abstract`                       | ✅ Mapped |
| **coverageLink**        | `pressLink` (linkedUrl)           | ✅ Mapped |
| **legacyLink**          | `legacyLink` or `legacyUrl`       | ✅ Mapped (if present in JSON) |
| **mediaContact**        | `sourcePerson[0]` → peopleCpt     | ✅ Mapped |
| **mediaLogo**           | `companyLogo[0]` → Asset         | ✅ Mapped |
| **addFeaturedToListing**| `switch`                         | ✅ Mapped |
| **sectionNavigation**   | `sectionNavigation` (array)      | ✅ Mapped (if present) |
| **sections**            | mainBannerPress + detailsContentPress + sideNavContentPress → components | ✅ Mapped |
| **boilerplate**         | For Entry Type "Boilerplate": `bodyRedactorRestricted` → RichText | ✅ Mapped |
| **postDate**            | `postDate` → Date (YYYY-MM-DD)   | ✅ Mapped |

## Section component types (sections)

- **mainBannerPress** (bannerSlim/bannerHero) → `mainBannerPress` entry  
- **contentBlock** → existing handler  
- **contentSummary** → ⚠️ **Not migrated** (no handler in registry); blocks are skipped, no error  
- **assetGrid** → handler in pressMediaHandler  
- **sideNavContentPress** → same matrix processing (contentBlock, etc.)

If you need **contentSummary** in Contentful, a new handler (or generic mapping) for the `contentSummary` content type must be added to the registry.

## Source fields not in Contentful schema

- `pressMediaCategories` / `generalCategories` – used for **taxonomy concepts** (metadata), not as a direct field  
- `bodyRedactorRestricted` – used only for Boilerplate entry type → `boilerplate`  
- `detailsContentPress` / `mainBannerPress` / `sideNavContentPress` – matrix fields that become **sections** (linked entries)

## Run one page for review

```bash
node index.js --id 2498310
```

First entry in the file (Pathfinder press release). After you confirm it in Contentful, run full migration (no `--id`) or batch with `--from` / `--to`.
