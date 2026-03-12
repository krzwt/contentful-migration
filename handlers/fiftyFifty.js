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
 */
export async function createOrUpdateFiftyFifty(
  env,
  id,
  fields,
  assetMap = null,
  summary = null,
) {
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
    }
  }

  // 4. Asset (Image/Video)
  let assetLink = null;
  if (fields.asset?.length && assetMap) {
    const craftAssetId = String(fields.asset[0]);
    const assetInfo = assetMap.get(craftAssetId);

    if (assetInfo) {
      const assetWrapper = await upsertAssetWrapper(
        env,
        craftAssetId,
        assetInfo.id,
        assetInfo.mimeType,
        assetInfo.wistiaUrl,
      );
      if (assetWrapper) {
        assetLink = makeLink(assetWrapper.sys.id);
      }
    }
  }

  // 4.5 Resource
  let resourceLink = null;
  if (fields.resource && fields.resource.length > 0) {
    const resourceId = String(fields.resource[0]);
    const contentfulId = ID_MAP[resourceId];
    if (contentfulId) {
      console.log(
        `   🔗 Mapping resource ${resourceId} to ${contentfulId} for fifty-fifty`,
      );
      resourceLink = makeLink(contentfulId);
    } else {
      // OPTIONAL: Blind link fallback if not in map (likely a resource)
      const blindId = `resource-${resourceId}`;
      console.warn(
        `   ⚠️ Resource ID ${resourceId} not in map for fifty-fifty. Attempting blind link to ${blindId}`,
      );
      resourceLink = makeLink(blindId);
      if (summary) summary.missingResources.add(resourceId);
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

  cfFields.cta = { [LOCALE]: ctaEntry ? makeLink(ctaEntry.sys.id) : null };

  if (assetLink) cfFields.addAsset = { [LOCALE]: assetLink };
  // if (resourceLink) cfFields.addResource = { [LOCALE]: resourceLink }; // Skip resources for now per user request

  // Create/Update the Fifty Fifty entry
  return await upsertEntry(env, CONTENT_TYPE, `fifty-${id}`, cfFields);
}
