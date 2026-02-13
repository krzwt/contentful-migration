const LOCALE = "en-US";
const PAGE_CT = "pageHero";

export async function attachHeroToPage(env, pageTitle, heroEntry) {
  const existing = await env.getEntries({
    content_type: PAGE_CT,
    "fields.pageTitle": pageTitle,
    limit: 1
  });

  let page;

  if (existing.items.length) {
    page = existing.items[0];
    console.log("📄 Found existing page:", page.sys.id);
  } else {
    console.log("🆕 Creating new page");

    page = await env.createEntry(PAGE_CT, {
      fields: {
        pageTitle: { [LOCALE]: pageTitle },
        pageComponents: { [LOCALE]: [] }
      }
    });
  }

  const components =
    page.fields.pageComponents?.[LOCALE] || [];

  const alreadyLinked = components.some(
    c => c.sys.id === heroEntry.sys.id
  );

  if (!alreadyLinked) {
    components.push({
      sys: {
        type: "Link",
        linkType: "Entry",
        id: heroEntry.sys.id
      }
    });

    page.fields.pageComponents = {
      [LOCALE]: components
    };

    page = await page.update();
    await page.publish();

    console.log("✅ Hero linked to page");
  }
}
