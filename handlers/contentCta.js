import {
  upsertEntry,
  upsertCta,
  makeLink,
  parseCraftLink,
  resolveInternalUrl,
} from "../utils/contentfulHelpers.js";

const LOCALE = "en-US";
const CONTENT_TYPE = "ctaBlock";

/**
 * Handler for contentCta (nested in contentBlock as type: cta)
 */
export async function createOrUpdateContentCta(
  env,
  id,
  fields,
  summary = null,
) {
  try {
    await env.getContentType(CONTENT_TYPE);
  } catch (err) {
    console.warn(
      `   ⚠ Component "${CONTENT_TYPE}" not found: ${err.message}. Skipping.`,
    );
    return null;
  }

  const rawLink = fields.contentCTA || fields.ctaLink;
  let ctaEntry = null;

  if (rawLink) {
    const linkInfo = parseCraftLink(rawLink);
    let label =
      fields.linkText ||
      fields.customLinkText ||
      fields.label ||
      linkInfo.label ||
      "";
    let url = linkInfo.url;

    if (!url && linkInfo.linkedId) {
      url = resolveInternalUrl(linkInfo.linkedId) || "";
    }

    if (url || label || linkInfo.linkedId) {
      ctaEntry = await upsertCta(
        env,
        `ctablock-${id}`,
        label,
        url,
        true,
        linkInfo.linkedId,
      );
    }
  }

  const cfFields = {
    blockId: { [LOCALE]: String(id) },
    blockName: {
      [LOCALE]: fields.blockName || fields.heading || `Content CTA`,
    },
  };

  if (ctaEntry) {
    cfFields.cta = { [LOCALE]: makeLink(ctaEntry.sys.id) };
  }

  return await upsertEntry(env, CONTENT_TYPE, `ctablock-${id}`, cfFields);
}
