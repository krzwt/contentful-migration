import crypto from "crypto";

export const LOCALE = "en-US";
const DEFAULT_PAGE_TYPE = "page";
const MAX_ID_LENGTH = 64;

// Cache: Craft parentId → Contentful `page` entry ID
const parentPageCache = new Map();

// Cache: contentType → sections field name ("sections" or "contentComponent")
const sectionsFieldCache = new Map();

/**
 * Auto-detect whether a content type uses "sections" or "contentComponent".
 * Result is cached per content type.
 */
async function detectSectionsField(env, contentType) {
  if (sectionsFieldCache.has(contentType)) return sectionsFieldCache.get(contentType);
  try {
    const ct = await env.getContentType(contentType);
    const fieldIds = ct.fields.map(f => f.id);
    const name = fieldIds.includes("contentComponent") ? "contentComponent" : "sections";
    sectionsFieldCache.set(contentType, name);
    console.log(`   🔍 Detected sections field for "${contentType}": ${name}`);
    return name;
  } catch {
    return "sections";
  }
}

/**
 * Generate a safe Contentful entry ID (max 64 chars).
 * If the raw ID exceeds 64 chars, truncate and append a short hash for uniqueness.
 */
export function safeId(prefix, slug) {
  // Sanitize: Only allow a-z, 0-9, _, -, . (Contentful requirement)
  const sanitized = (slug || "")
    .replace(/[^a-zA-Z0-9_\-\.]/g, "-")
    .replace(/-+/g, "-")        // Collapse multiple dashes
    .replace(/^-+|-+$/g, "");   // Trim dashes

  // Ensure prefix is included
  const raw = `${prefix}-${sanitized}`;

  // If the result is just the prefix or too long, we MUST use a hash to ensure uniqueness
  if (raw.length <= MAX_ID_LENGTH && sanitized.length > 0) {
    return raw;
  }

  // Generate a fallback ID with hash
  const hash = crypto.createHash("md5").update(`${prefix}-${slug}`).digest("hex").substring(0, 8);
  const truncated = raw.substring(0, MAX_ID_LENGTH - 9).replace(/-$/, "");
  return `${truncated}-${hash}`;
}

/**
 * Gets or creates a `page` entry to serve as a parent page.
 * Since the parent (e.g. "Index" / slug:"sem") may be deactivated in Craft,
 * we create it as a `page` entry in Contentful so it can be referenced
 * by pageSettings.parentPage.
 */
async function getOrCreateParentPage(env, parentId, allPages, pageContentType = DEFAULT_PAGE_TYPE) {
  if (parentPageCache.has(parentId)) {
    return parentPageCache.get(parentId);
  }

  // Find parent info from the data
  const parentData = allPages.find(p => String(p.id) === String(parentId));
  const parentSlug = parentData?.slug || `parent-${parentId}`;
  const parentTitle = parentData?.title || `Parent ${parentId}`;

  try {
    // Try to find existing page entry by slug
    const existing = await env.getEntries({
      content_type: pageContentType,
      "fields.slug": parentSlug,
      limit: 1
    });

    let pageEntry;
    if (existing.items.length) {
      pageEntry = existing.items[0];
      console.log(`   📄 Found existing parent page: "${parentTitle}" (${pageEntry.sys.id})`);
    } else {
      console.log(`   🆕 Creating parent page: "${parentTitle}" (Type: ${pageContentType}, slug: ${parentSlug})`);
      pageEntry = await env.createEntry(pageContentType, {
        fields: {
          title: { [LOCALE]: parentTitle },
          slug: { [LOCALE]: parentSlug }
        }
      });
      pageEntry = await pageEntry.update();
      pageEntry = await pageEntry.publish();
    }

    parentPageCache.set(parentId, pageEntry.sys.id);
    return pageEntry.sys.id;
  } catch (err) {
    console.error(`   ❌ Error creating parent page for ${parentId} (Type: ${pageContentType}):`, err.message);
    return null;
  }
}

/**
 * Creates a `seo` entry from Craft seoMetaTags data.
 */
export async function getOrCreateSeo(env, pageData, assetMap = null) {
  const seoData = pageData.seoMetaTags?.metaGlobalVars;
  if (!seoData) return null;

  const DEFAULT_DESCRIPTION = "BeyondTrust’s Privileged Access Management platform protects your organization from unwanted remote access, stolen credentials, and misused privileges";

  // Helper to clean values (skip Twig templates)
  const cleanVal = (v) => (v && typeof v === "string" && !v.includes("{{") && v.trim()) ? v.trim() : "";

  const metaTitle = cleanVal(seoData.seoTitle);
  let metaDescription = cleanVal(seoData.seoDescription);

  // If description is missing or identical to title, use the global default
  if (!metaDescription || metaDescription.toLowerCase() === (metaTitle || pageData.title || "").toLowerCase()) {
    metaDescription = DEFAULT_DESCRIPTION;
  }

  // Truncate if exceeds the Contentful validation limit of 256 characters
  // We use 255 to be safe with potential multi-byte characters or inclusive limits
  if (metaDescription.length > 255) {
    metaDescription = metaDescription.substring(0, 252) + "...";
  }

  const canonicalUrl = cleanVal(seoData.canonicalUrl);
  const ogTitle = cleanVal(seoData.ogTitle);
  let ogDescription = cleanVal(seoData.ogDescription);

  if (ogDescription.length > 255) {
    ogDescription = ogDescription.substring(0, 252) + "...";
  }

  const robots = cleanVal(seoData.robots) || "index, follow";
  const jsonLdSchema = cleanVal(seoData.jsonLdSchema);

  // Parse robots → noIndex / noFollow booleans
  const robotsLower = robots.toLowerCase();
  const noIndex = robotsLower.includes("noindex") || robotsLower === "none";
  const noFollow = robotsLower.includes("nofollow") || robotsLower === "none";

  const seoId = safeId("seo", pageData.slug);

  try {
    const fields = {
      metaTitle: { [LOCALE]: metaTitle || pageData.title || "Meta Title" },
      metaDescription: { [LOCALE]: metaDescription },
      noIndex: { [LOCALE]: noIndex },
      noFollow: { [LOCALE]: noFollow }
    };

    if (canonicalUrl) fields.canonicalUrl = { [LOCALE]: canonicalUrl };
    if (ogTitle) fields.ogTitle = { [LOCALE]: ogTitle };
    if (ogDescription) fields.ogDescription = { [LOCALE]: ogDescription };
    if (jsonLdSchema) fields.jsonLdSchema = { [LOCALE]: jsonLdSchema };

    // Handle SEO Image
    let imageAssetId = null;
    const DEFAULT_SEO_IMAGE = "asset-45209";

    if (seoData.seoImage && Array.isArray(seoData.seoImage) && seoData.seoImage[0]) {
      const craftAssetId = String(seoData.seoImage[0]);
      // Use mapped ID if we have it (pre-migrated or current run)
      if (assetMap && assetMap.has(craftAssetId)) {
        imageAssetId = assetMap.get(craftAssetId).id;
      } else {
        // Fallback to convention id for new uploads
        imageAssetId = `asset-${craftAssetId}`;
      }
    } else {
      // Use fallback from env or hardcoded brand card
      const fallback = process.env.DEFAULT_SEO_IMAGE_ID || DEFAULT_SEO_IMAGE;
      imageAssetId = fallback.startsWith("asset-") ? fallback : `asset-${fallback}`;
    }

    if (imageAssetId) {
      fields.ogImage = {
        [LOCALE]: { sys: { type: "Link", linkType: "Asset", id: imageAssetId } }
      };
    }

    if (!env) {
      console.log(`   [DRY RUN] Would upsert SEO: ${seoId}`);
      return { sys: { id: seoId } };
    }
    let entry;
    try {
      entry = await env.getEntry(seoId);
      console.log(`   🔄 Updating SEO: ${seoId}`);
      entry.fields = { ...entry.fields, ...fields };
      entry = await entry.update();
    } catch {
      console.log(`   ✨ Creating SEO: ${seoId}`);
      entry = await env.createEntryWithId("seo", seoId, { fields });
    }

    await entry.publish();
    return entry;
  } catch (err) {
    console.error(`   ❌ Error with SEO for "${pageData.title}":`, err.message);
    if (err.details) console.log(JSON.stringify(err.details, null, 2));
    return null;
  }
}

/**
 * Creates a `pageSettings` entry with slug and optional parent page link + SEO.
 */
async function getOrCreatePageSettings(env, pageData, allPages, pageContentType = DEFAULT_PAGE_TYPE, assetMap = null) {
  const settingsId = safeId("settings", pageData.slug);

  try {
    const fields = {
      pageSetting: { [LOCALE]: `Page Settings: ${pageData.title}` },
      enableSidenav: { [LOCALE]: !!pageData.enableSidenav || pageData.typeId === 133 },
      mainNavigationSwitch: { [LOCALE]: pageData.mainNavigationSwitch !== false },
      mainNavigationDefaultCtAs: { [LOCALE]: pageData.mainNavigationDefaultCtas !== false },
      mainNavigationSearchSwitch: { [LOCALE]: pageData.mainNavigationSearchSwitch !== false },
      mainNavigationLanguageSwitch: { [LOCALE]: pageData.mainNavigationLanguageSwitch !== false },
      breadcrumbSwitch: { [LOCALE]: pageData.breadcrumbSwitch !== false },
      enableSidebarForm: { [LOCALE]: !!pageData.enableSidebarForm || pageData.typeId === 134 }
    };

    // Extract sidebar form fields if present
    if (pageData.sidebarFormsStandalone) {
      const forms = Object.values(pageData.sidebarFormsStandalone);
      const formBlock = forms.find(f => (f.type === 'form' || f.type === 'resourceForm') && f.enabled);
      if (formBlock) {
        if (formBlock.fields.headingSection || formBlock.fields.heading) {
          fields.sfHeading = { [LOCALE]: formBlock.fields.headingSection || formBlock.fields.heading };
        }
        if (formBlock.fields.bodyMedium || formBlock.fields.bodyRedactorRestricted || formBlock.fields.description) {
          fields.sfDescription = { [LOCALE]: formBlock.fields.bodyMedium || formBlock.fields.bodyRedactorRestricted || formBlock.fields.description };
        }
        if (formBlock.fields.salesforceCampaignId) {
          fields.salesforceCampaignId = { [LOCALE]: formBlock.fields.salesforceCampaignId };
        }
        if (formBlock.fields.leadSourceDetails) {
          fields.leadSourceDetails = { [LOCALE]: formBlock.fields.leadSourceDetails };
        }
      }
    }

    // Link parent page
    if (pageData.parentId) {
      const parentEntryId = await getOrCreateParentPage(env, pageData.parentId, allPages, pageContentType);
      if (parentEntryId) {
        fields.parentPage = {
          [LOCALE]: { sys: { type: "Link", linkType: "Entry", id: parentEntryId } }
        };
      }
    }

    // Link SEO
    const seoEntry = await getOrCreateSeo(env, pageData, assetMap);
    if (seoEntry) {
      fields.seo = {
        [LOCALE]: { sys: { type: "Link", linkType: "Entry", id: seoEntry.sys.id } }
      };
    }

    let entry;
    try {
      entry = await env.getEntry(settingsId);
      console.log(`   🔄 Updating page settings: ${settingsId}`);

      // Merge fields
      entry.fields = { ...entry.fields, ...fields };
      entry = await entry.update();
    } catch {
      console.log(`   ✨ Creating page settings: ${settingsId}`);
      entry = await env.createEntryWithId("pageSettings", settingsId, { fields });
    }

    await entry.publish();
    return entry;
  } catch (err) {
    console.error(`   ❌ Error with page settings for "${pageData.title}":`, err.message);
    return null;
  }
}

/**
 * Searches for an existing page by title or creates a new one.
 * Now also handles creating pageSettings with parent page link.
 */
export async function getOrCreatePage(env, pageData, pageContentType = DEFAULT_PAGE_TYPE, allPages = [], assetMap = null) {
  const { title, slug, id: craftId } = pageData;

  try {
    const existing = await env.getEntries({
      content_type: pageContentType,
      "fields.entryId": String(craftId),
      limit: 1
    });

    let page;
    let isNew = false;

    if (existing.items.length) {
      page = existing.items[0];
      console.log(`📄 Found existing page: ${title} (${page.sys.id})`);
    } else {
      console.log(`🆕 Creating new page: ${title}`);
      isNew = true;
      const sectionsField = await detectSectionsField(env, pageContentType);
      page = await env.createEntry(pageContentType, {
        fields: {
          entryId: { [LOCALE]: craftId ? String(craftId) : "" },
          title: { [LOCALE]: title },
          slug: { [LOCALE]: slug },
          [sectionsField]: { [LOCALE]: [] }
        }
      });
    }

    // Update entryId/slug/title if they changed
    let needsUpdate = isNew;
    const craftIdStr = craftId ? String(craftId) : "";
    if (page.fields.entryId?.[LOCALE] !== craftIdStr) {
      page.fields.entryId = { [LOCALE]: craftIdStr };
      needsUpdate = true;
    }
    if (page.fields.slug?.[LOCALE] !== slug) {
      page.fields.slug = { [LOCALE]: slug };
      needsUpdate = true;
    }
    if (page.fields.title?.[LOCALE] !== title) {
      page.fields.title = { [LOCALE]: title };
      needsUpdate = true;
    }

    // Always call getOrCreatePageSettings so it can update existing entries (e.g. name changes)
    const settingsEntry = await getOrCreatePageSettings(env, pageData, allPages, pageContentType, assetMap);
    if (settingsEntry) {
      const currentSettingsId = page.fields.settings?.[LOCALE]?.sys?.id;
      if (currentSettingsId !== settingsEntry.sys.id) {
        page.fields.settings = {
          [LOCALE]: {
            sys: { type: "Link", linkType: "Entry", id: settingsEntry.sys.id }
          }
        };
        needsUpdate = true;
        console.log(`   🔗 Linked settings to page "${title}"`);
      }
    }

    const isLive = pageData.enabled !== false && pageData.status === "live";

    if (needsUpdate || isNew) {
      console.log(`📡 Updating page "${title}" (Status: ${isLive ? 'Live' : 'Hidden/Draft'})...`);
      page = await page.update();
    }

    return page;
  } catch (err) {
    console.error(`❌ Error in getOrCreatePage for "${title}":`, err.message);
    if (err.details) console.error("Details:", JSON.stringify(err.details, null, 2));
    return null;
  }
}

/**
 * Publishes or unpublishes a page based on its live status.
 * This should be called AFTER sections have been added.
 */
export async function publishPage(env, page, pageData) {
  const isLive = pageData.enabled !== false && pageData.status === "live";
  const title = pageData.title;

  try {
    // Re-fetch to get latest version
    page = await env.getEntry(page.sys.id);

    const isCurrentlyPublished = !!page.sys.publishedVersion && (page.sys.version === page.sys.publishedVersion + 1);

    if (isLive) {
      if (!isCurrentlyPublished) {
        console.log(`📡 Publishing page "${title}"...`);
        page = await page.publish();
        console.log(`✅ Page "${title}" published.`);
      }
    } else {
      if (isCurrentlyPublished) {
        console.log(`📡 Unpublishing page "${title}"...`);
        page = await page.unpublish();
        console.log(`⏸️  Page "${title}" set to Draft (Unpublished).`);
      }
    }
    return page;
  } catch (err) {
    console.error(`❌ Error publishing page "${title}":`, err.message);
    if (err.details) console.error("Details:", JSON.stringify(err.details, null, 2));
    return page;
  }
}

/**
 * Links a component entry to the page.
 */
export async function attachHeroToPage(env, pageEntry, heroEntry) {
  if (!pageEntry || !heroEntry) return;

  try {
    // sections is an Array of Links
    let currentLinks = pageEntry.fields.sections?.[LOCALE] || [];

    // Check if already linked
    const exists = currentLinks.some(link => link.sys.id === heroEntry.sys.id);
    if (exists) {
      console.log(`ℹ️ Component ${heroEntry.sys.id} already linked to page.`);
      return pageEntry;
    }

    console.log(`🔗 Linking component ${heroEntry.sys.id} to page ${pageEntry.fields.title[LOCALE]}`);

    currentLinks.push({
      sys: {
        type: "Link",
        linkType: "Entry",
        id: heroEntry.sys.id
      }
    });

    pageEntry.fields.sections = {
      [LOCALE]: currentLinks
    };

    pageEntry = await pageEntry.update();
    pageEntry = await pageEntry.publish();
    console.log(`✅ Component linked to page.`);
    return pageEntry;
  } catch (err) {
    console.error(`❌ Error linking component to page:`, err.message);
    if (err.details) console.error("Details:", JSON.stringify(err.details, null, 2));
    return pageEntry;
  }
}

/**
 * Sets the complete sections array on a page in one go.
 * This REPLACES any existing sections to guarantee correct order.
 */
export async function setSectionsOnPage(env, pageEntry, sectionEntries) {
  if (!pageEntry || !sectionEntries.length) return pageEntry;

  try {
    const links = sectionEntries.map(entry => ({
      sys: {
        type: "Link",
        linkType: "Entry",
        id: entry.sys.id
      }
    }));

    console.log(`\n📋 Setting ${links.length} sections on page "${pageEntry.fields.title[LOCALE]}" (in order)`);

    // Auto-detect the sections field
    const contentTypeId = pageEntry.sys.contentType?.sys?.id || "";
    const sectionsField = await detectSectionsField(env, contentTypeId);

    // Re-fetch to get latest version
    pageEntry = await env.getEntry(pageEntry.sys.id);
    pageEntry.fields[sectionsField] = { [LOCALE]: links };
    pageEntry = await pageEntry.update();
    pageEntry = await pageEntry.publish();

    console.log(`✅ Sections set in correct order.`);
    return pageEntry;
  } catch (err) {
    console.error(`❌ Error setting sections on page:`, err.message);
    if (err.details) console.error("Details:", JSON.stringify(err.details, null, 2));
    return pageEntry;
  }
}
