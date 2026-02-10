import { convertHtmlToRichText } from "../utils/richText.js";

const LOCALE = "en-US";

/**
 * Generic handler driven by mapping JSON
 * Works for text + richText fields
 */
export async function genericComponentHandler(env, block, mapping) {
  const LOCALE = "en-US";
  const blockIdValue = String(block[mapping.idField] || "").trim();
  if (!blockIdValue) return null;

  // 🔍 Safe query (blockId MUST be Short text)
  const existing = await env.getEntries({
    content_type: mapping.contentType,
    "fields.blockId": blockIdValue,
    limit: 1
  });

  const fields = { blockId: { [LOCALE]: blockIdValue } };

  for (const [fieldId, cfg] of Object.entries(mapping.fields)) {
    if (fieldId === "blockId") continue;
    const value = block[cfg.from];

    if (cfg.type === "richText") {
      fields[fieldId] = {
        [LOCALE]: await convertHtmlToRichText(env, value)
      };
    } else {
      fields[fieldId] = {
        [LOCALE]: value ?? ""
      };
    }
  }

  // UPDATE
  if (existing.items.length) {
    const entry = existing.items[0];
    entry.fields = { ...entry.fields, ...fields };
    await (await entry.update()).publish();
    return entry.sys.id;
  }

  // CREATE
  const entry = await env.createEntry(mapping.contentType, { fields })

  await entry.publish();
  return entry.sys.id;
}
