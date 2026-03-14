import { upsertEntry } from "../utils/contentfulHelpers.js";

const LOCALE = "en-US";
const CONTENT_TYPE = "newPartnersEmbeds";

/**
 * Migrate Craft newPartnersEmbeds entries → Contentful newPartnersEmbeds CPT.
 * Looks up by entryId first: if an entry with that Craft id already exists, we update it
 * instead of creating a new one (avoids duplicates).
 * Fields: entryId (Symbol), title (Symbol, required), code (Text).
 */
export async function migratePartnersEmbeds(env, data, summary = null) {
  const entries = Array.isArray(data) ? data : [data];

  console.log(`\n📦 Starting Partners Embeds Migration (${entries.length} entries)...`);

  for (let i = 0; i < entries.length; i++) {
    const item = entries[i];
    const craftId = String(item.id);
    const shouldPublish = item.status === "live";

    const fields = {
      entryId: { [LOCALE]: craftId },
      title: { [LOCALE]: (item.title || "Untitled").trim() },
      code: { [LOCALE]: item.code != null ? String(item.code) : "" },
    };

    // Resolve Contentful entry: if one already exists with this entryId, update it (don't create new)
    let contentfulId = `partners-embed-${craftId}`;
    if (env) {
      try {
        const existing = await env.getEntries({
          content_type: CONTENT_TYPE,
          "fields.entryId": craftId,
          limit: 1,
        });
        if (existing.items.length > 0) {
          contentfulId = existing.items[0].sys.id;
          console.log(`   📎 Found existing entry by entryId ${craftId} → ${contentfulId}`);
        }
      } catch (_) {
        // keep contentfulId as partners-embed-{id} for create
      }
    }

    console.log(`➡️ [${i + 1} / ${entries.length}] ${item.title} (${contentfulId})`);

    try {
      const entry = await upsertEntry(env, CONTENT_TYPE, contentfulId, fields, shouldPublish);
      if (entry && summary) {
        summary.processed++;
        if (entry.sys.version === 1) summary.created++;
        else summary.updated++;
      }
    } catch (err) {
      console.error(`❌ Error migrating partners embed "${item.title}":`, err.message);
      if (summary) {
        summary.skipped.push({
          page: item.title,
          blockId: contentfulId,
          type: CONTENT_TYPE,
          error: err.message,
        });
      }
    }
  }
}
