const LOCALE = "en-US";
const PAGE_CT = "newStandaloneConversion";

// Cache: Craft parentId → Contentful `page` entry ID
const parentPageCache = new Map();

/**
 * Gets or creates a `page` entry to serve as a parent page.
 * Since the parent (e.g. "Index" / slug:"sem") may be deactivated in Craft,
 * we create it as a `page` entry in Contentful so it can be referenced
 * by pageSettings.parentPage.
 */
async function getOrCreateParentPage(env, parentId, allPages) {
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
      content_type: "page",
      "fields.slug": parentSlug,
      limit: 1
    });

    let pageEntry;
    if (existing.items.length) {
      pageEntry = existing.items[0];
      console.log(`   📄 Found existing parent page: "${parentTitle}" (${pageEntry.sys.id})`);
    } else {
      console.log(`   🆕 Creating parent page: "${parentTitle}" (slug: ${parentSlug})`);
      pageEntry = await env.createEntry("page", {
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
    console.error(`   ❌ Error creating parent page for ${parentId}:`, err.message);
    return null;
  }
}

/**
 * Creates a `pageSettings` entry with slug and optional parent page link.
 */
async function getOrCreatePageSettings(env, pageData, allPages) {
  const settingsId = `settings-${(pageData.slug || "").replace(/\//g, "-")}`;

  try {
    const fields = {
      slug: { [LOCALE]: pageData.slug || "" },
      enableSidenav: { [LOCALE]: false }
    };

    // If this page has a parentId, create/find the parent `page` and link it
    if (pageData.parentId) {
      const parentEntryId = await getOrCreateParentPage(env, pageData.parentId, allPages);
      if (parentEntryId) {
        fields.parentPage = {
          [LOCALE]: {
            sys: { type: "Link", linkType: "Entry", id: parentEntryId }
          }
        };
        console.log(`   🔗 Settings: linked parent page (${parentEntryId})`);
      }
    }

    let entry;
    try {
      entry = await env.getEntry(settingsId);
      console.log(`   🔄 Updating page settings: ${settingsId}`);
      entry.fields = fields;
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
export async function getOrCreatePage(env, pageData, pageContentType = PAGE_CT, allPages = []) {
  const { title, slug, id: craftId } = pageData;

  try {
    const existing = await env.getEntries({
      content_type: pageContentType,
      "fields.title": title,
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
      page = await env.createEntry(pageContentType, {
        fields: {
          entryId: { [LOCALE]: craftId ? String(craftId) : "" },
          title: { [LOCALE]: title },
          slug: { [LOCALE]: slug },
          sections: { [LOCALE]: [] }
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

    // Create and link pageSettings (with parent page) if not already set
    if (!page.fields.settings?.[LOCALE]) {
      const settingsEntry = await getOrCreatePageSettings(env, pageData, allPages);
      if (settingsEntry) {
        page.fields.settings = {
          [LOCALE]: {
            sys: { type: "Link", linkType: "Entry", id: settingsEntry.sys.id }
          }
        };
        needsUpdate = true;
        console.log(`   🔗 Linked settings to page "${title}"`);
      }
    }

    if (needsUpdate || isNew) {
      console.log(`📡 Updating/Publishing page "${title}"...`);
      page = await page.update();
      page = await page.publish();
      console.log(`✅ Page "${title}" ready.`);
    }

    return page;
  } catch (err) {
    console.error(`❌ Error in getOrCreatePage for "${title}":`, err.message);
    if (err.details) console.error("Details:", JSON.stringify(err.details, null, 2));
    return null;
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

    // Re-fetch to get latest version
    pageEntry = await env.getEntry(pageEntry.sys.id);
    pageEntry.fields.sections = { [LOCALE]: links };
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
