import fs from "fs";
import { getEnvironment } from "./config/contentful.js";
import { COMPONENTS } from "./registry.js";

const PAGE_CONTENT_TYPE = "pageLanding";
const LOCALE = "en-US";
const JSON_FILE = "./data/standalone-test.json";

async function runImport() {
  const env = await getEnvironment();
  const raw = JSON.parse(fs.readFileSync(JSON_FILE, "utf8"));
  const pages = raw?.data?.entries || [];

  let processedCount = 0;

  for (const page of pages) {
    const craftId = String(page.id || "").trim();
    const title = page.title?.trim();
    const slug = page.slug?.trim();

    if (!craftId || !title || !slug) {
      console.warn("⚠️ Skipping invalid page record:", page);
      continue;
    }

    console.log(`\n➡️ Processing page: ${title} (${craftId})`);

    const components = [];

    for (const [handle, cfg] of Object.entries(COMPONENTS)) {
      const blocks = page[handle];
      if (!Array.isArray(blocks)) continue;

      for (const block of blocks) {
        const id = await cfg.handler(env, block, cfg.mapping);
        if (!id) continue;

        const entry = await env.getEntry(id);
        const expectedType = cfg.mapping.contentType;

        if (entry.sys.contentType.sys.id !== expectedType) {
          console.warn(
            `⚠️  Skipping component ${id}: expected ${expectedType}, got ${entry.sys.contentType.sys.id}`
          );
          continue;
        }

        components.push({
          sys: { type: "Link", linkType: "Entry", id }
        });
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

      console.log(
        `🔄 Page updated: ${title} | Components: ${components.length}`
      );
    } else {
      const pageEntry = await env.createEntry(PAGE_CONTENT_TYPE, {
        fields: {
          craftId: { [LOCALE]: craftId },
          title: { [LOCALE]: title },
          slug: { [LOCALE]: slug },
          pageComponenents: { [LOCALE]: components }
        }
      });

      await pageEntry.publish();

      console.log(
        `✔ Page created: ${title} | Components: ${components.length}`
      );
    }

    processedCount++;
  }

  console.log(`\n🎉 Import complete — Pages processed: ${processedCount}`);
}

runImport();
