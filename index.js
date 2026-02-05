import fs from "fs";
import { getEnvironment } from "./config/contentful.js";
import { COMPONENTS } from "./registry.js";

const PAGE_CONTENT_TYPE = "pageLanding";
const LOCALE = "en-US";
const JSON_FILE = "./data/test1.json";

async function runImport() {
  const env = await getEnvironment();
  const raw = JSON.parse(fs.readFileSync(JSON_FILE, "utf8"));
  const pages = raw?.data?.entries || [];

  for (const page of pages) {
    const craftId = String(page.id || "").trim();
    const title = page.title?.trim();
    const slug = page.slug?.trim();
    if (!craftId || !title || !slug) continue;

    const components = [];

    for (const [handle, cfg] of Object.entries(COMPONENTS)) {
      const blocks = page[handle];
      if (!Array.isArray(blocks)) continue;

      for (const block of blocks) {
        const id = await cfg.handler(env, block);
        if (id) {
          components.push({
            sys: { type: "Link", linkType: "Entry", id }
          });
        }
      }
    }

    const existing = await env.getEntries({
      content_type: PAGE_CONTENT_TYPE,
      "fields.craftId": craftId,
      limit: 1
    });

    if (existing.items.length) {
      const pageEntry = existing.items[0];
      pageEntry.fields.pageComponenents = { [LOCALE]: components };
      await (await pageEntry.update()).publish();
      continue;
    }

    const pageEntry = await env.createEntry(PAGE_CONTENT_TYPE, {
      fields: {
        craftId: { [LOCALE]: craftId },
        title: { [LOCALE]: title },
        slug: { [LOCALE]: slug },
        pageComponenents: { [LOCALE]: components }
      }
    });

    await pageEntry.publish();
  }

  console.log("🎉 Import complete");
}

runImport();
