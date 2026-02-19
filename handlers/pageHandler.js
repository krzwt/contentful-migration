const LOCALE = "en-US";
const PAGE_CT = "pageHero1";

/**
 * Searches for an existing page by title or creates a new one.
 */
export async function getOrCreatePage(env, pageData) {
  const { title, slug } = pageData;

  try {
    const existing = await env.getEntries({
      content_type: PAGE_CT,
      "fields.pageTitle": title,
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
      // pageHero uses an array of Links
      page = await env.createEntry(PAGE_CT, {
        fields: {
          pageTitle: { [LOCALE]: title },
          slug: { [LOCALE]: slug },
          blocks: { [LOCALE]: [] }
        }
      });
    }

    // Update slug/title if they changed
    let needsUpdate = isNew;
    if (page.fields.slug?.[LOCALE] !== slug) {
      page.fields.slug = { [LOCALE]: slug };
      needsUpdate = true;
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
 * Handles the fact that blocks in pageHero1 is a single Link.
 */
export async function attachHeroToPage(env, pageEntry, heroEntry) {
  if (!pageEntry || !heroEntry) return;

  try {
    // blocks is an Array of Links in pageHero
    let currentLinks = pageEntry.fields.blocks?.[LOCALE] || [];

    // Check if already linked
    const exists = currentLinks.some(link => link.sys.id === heroEntry.sys.id);
    if (exists) {
      console.log(`ℹ️ Component ${heroEntry.sys.id} already linked to page.`);
      return pageEntry;
    }

    console.log(`🔗 Linking component ${heroEntry.sys.id} to page ${pageEntry.fields.pageTitle[LOCALE]}`);

    currentLinks.push({
      sys: {
        type: "Link",
        linkType: "Entry",
        id: heroEntry.sys.id
      }
    });

    pageEntry.fields.blocks = {
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
