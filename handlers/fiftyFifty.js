import { convertHtmlToRichText } from "../utils/richText.js";
import {
  upsertCta,
  upsertSectionTitle,
  upsertEntry,
  makeLink,
  upsertAssetWrapper,
  ensureAssetPublished,
  parseCraftLink,
  resolveInternalUrl,
  resolveEntryRef,
} from "../utils/contentfulHelpers.js";
import fs from "fs";

let ID_MAP = {};
try {
  if (fs.existsSync("./data/resource_id_map.json")) {
    ID_MAP = JSON.parse(
      fs.readFileSync("./data/resource_id_map.json", "utf-8"),
    );
  }
} catch (e) {
  console.warn("   ⚠️ resource_id_map.json could not be loaded.");
}

const LOCALE = "en-US";
const CONTENT_TYPE = "fiftyFiftyComponent";

/**
 * Handler for fiftyFiftyComponent (mapped from Craft contentWithAsset)
 * Called from index.js as (env, payload, assetMap, summary) with payload = { blockId, ...fields }
 * or from contentBlock as (env, id, fields, assetMap, summary).
 */
export async function createOrUpdateFiftyFifty(
  env,
  idOrPayload,
  fieldsOrAssetMap,
  assetMapOrSummary = null,
  summary = null,
) {
  let id;
  let fields;
  let assetMap;
  if (typeof idOrPayload === "object" && idOrPayload !== null && idOrPayload.blockId != null) {
    // Called from index.js: (env, { blockId, ...fields }, assetMap, summary)
    id = idOrPayload.blockId;
    fields = idOrPayload;
    assetMap = fieldsOrAssetMap;
    summary = assetMapOrSummary;
  } else {
    id = idOrPayload;
    fields = fieldsOrAssetMap || {};
    assetMap = assetMapOrSummary;
  }

  if (!env) {
    console.log(`   [DRY RUN] Would process fiftyFiftyComponent: ${id}`);
    return { sys: { id: `fifty-${id}` } };
  }

  // 1. Section Title
  let titleEntry = null;
  if (fields.heading) {
    titleEntry = await upsertSectionTitle(env, id, fields.heading);
  }

  // 2. Description (Rich Text)
  const description = await convertHtmlToRichText(env, fields.body || "");

  // 3. CTA – support ctaLink, contentCTA, ctaUrl and linkText, ctaLinkText, ctaLabel
  let ctaEntry = null;
  const ctaLinkRaw = fields.ctaLink || fields.contentCTA || fields.ctaUrl;
  if (ctaLinkRaw) {
    const linkInfo = parseCraftLink(ctaLinkRaw);
    const label =
      fields.linkText ||
      fields.ctaLinkText ||
      fields.ctaLabel ||
      linkInfo.label ||
      "";
    let url = linkInfo.url || "";
    if (!url && linkInfo.linkedId) {
      url = resolveInternalUrl(linkInfo.linkedId) || "";
    }
    if (label || url || linkInfo.linkedId) {
      ctaEntry = await upsertCta(
        env,
        `fifty-${id}`,
        label,
        url,
        true,
        linkInfo.linkedId,
      );
      if (!ctaEntry && (label || linkInfo.linkedId)) {
        console.warn(`   ⚠️ CTA for fifty-${id} was skipped by upsertCta (no URL/pageLink). Check linkedId ${linkInfo.linkedId} is in URL map or entry cache.`);
      }
    }
  }

  // 4. Asset (Image/Video) — use asset or video array; S3/Wistia URLs go to Video URL field (no upload)
  let assetLink = null;
  const assetIds = fields.asset?.length ? fields.asset : fields.video;
  if (assetIds?.length && assetMap) {
    const craftAssetId = String(assetIds[0]);
    const assetInfo = assetMap.get(craftAssetId);

    if (assetInfo) {
      const assetWrapper = await upsertAssetWrapper(
        env,
        craftAssetId,
        assetInfo.id,
        assetInfo.mimeType,
        assetInfo.wistiaUrl,
        assetInfo.title,
      );
      if (assetWrapper) {
        assetLink = makeLink(assetWrapper.sys.id);
      }
    }
  }

  // 4.5 Resource (Add Resource – link to resourcesCpt)
  let resourceLink = null;
  if (fields.resource && fields.resource.length > 0) {
    const resourceId = String(fields.resource[0]);
    const ref = resolveEntryRef(resourceId);
    if (ref?.type === "resourcesCpt" && ref?.id) {
      resourceLink = makeLink(ref.id);
    } else {
      const contentfulId = ID_MAP[resourceId];
      if (contentfulId) {
        resourceLink = makeLink(contentfulId);
      } else if (env) {
        try {
          const existing = await env.getEntry(`resource-${resourceId}`);
          if (existing?.sys?.id) resourceLink = makeLink(existing.sys.id);
        } catch (_) {}
        if (!resourceLink && summary) summary.missingResources.add(resourceId);
      }
    }
  }

  // Map values exactly as defined in Contentful Schema:
  const alignment = fields.contentAlignment ? "Right" : "Left";

  let theme = "White Theme";
  if (fields.contentTheme === "blueTheme") theme = "Blue Theme";

  // 5. Construct fields for fiftyFiftyComponent
  const cfFields = {
    blockId: { [LOCALE]: String(id) },
    blockName: { [LOCALE]: fields.heading || "Fifty Fifty Component" },
    description: { [LOCALE]: description },
    contentAlignment: { [LOCALE]: alignment },
    contentTheme: { [LOCALE]: theme },
  };

  if (titleEntry)
    cfFields.sectionTitle = { [LOCALE]: makeLink(titleEntry.sys.id) };

  if (ctaEntry) cfFields.cta = { [LOCALE]: makeLink(ctaEntry.sys.id) };

  if (assetLink) cfFields.addAsset = { [LOCALE]: assetLink };
  if (resourceLink) cfFields.addResource = { [LOCALE]: resourceLink };

  // Create/Update the Fifty Fifty entry
  return await upsertEntry(env, CONTENT_TYPE, `fifty-${id}`, cfFields);
}
