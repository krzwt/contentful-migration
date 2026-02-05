import { convertHtmlToRichText } from "../utils/richText.js";

const CONTENT_TYPE = "homeHero";
const LOCALE = "en-US";

export async function handleHomeHero(env, block) {
  const blockId = String(block.id || "").trim();
  const title = block.headingSection?.trim();
  const desc = block.descSection || "";

  if (!blockId || !title) return null;

  const richText = await convertHtmlToRichText(env, desc);

  const existing = await env.getEntries({
    content_type: CONTENT_TYPE,
    "fields.blockId": blockId,
    limit: 1
  });

  if (existing.items.length) {
    const hero = existing.items[0];
    hero.fields.heroTitle = { [LOCALE]: title };
    hero.fields.heroDescription = { [LOCALE]: richText };
    await (await hero.update()).publish();
    return hero.sys.id;
  }

  const hero = await env.createEntry(CONTENT_TYPE, {
    fields: {
      blockId: { [LOCALE]: blockId },
      heroTitle: { [LOCALE]: title },
      heroDescription: { [LOCALE]: richText }
    }
  });

  await hero.publish();
  return hero.sys.id;
}
