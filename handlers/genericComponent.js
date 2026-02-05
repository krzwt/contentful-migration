import { convertHtmlToRichText } from "../utils/richText.js";

const LOCALE = "en-US";

export default async function genericComponent(env, craftBlock, mapping) {
  const blockId = String(craftBlock[mapping.idField] || "").trim();
  if (!blockId) return null;

  const fields = {
    blockId: { [LOCALE]: blockId }
  };

  for (const [cfField, config] of Object.entries(mapping.fields)) {
    const value = craftBlock[config.from];

    if (config.type === "richText") {
      fields[cfField] = {
        [LOCALE]: await convertHtmlToRichText(env, value || "")
      };
    } else {
      fields[cfField] = {
        [LOCALE]: value ?? ""
      };
    }
  }

  const existing = await env.getEntries({
    content_type: mapping.contentType,
    "fields.blockId": blockId,
    limit: 1
  });

  if (existing.items.length) {
    const entry = existing.items[0];
    entry.fields = { ...entry.fields, ...fields };
    await entry.update().then(e => e.publish());
    return entry.sys.id;
  }

  const entry = await env.createEntry(mapping.contentType, { fields });
  await entry.publish();
  return entry.sys.id;
}
