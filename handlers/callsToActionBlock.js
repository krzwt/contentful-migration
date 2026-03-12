/**
 * Handler: callsToAction (Craft) → callsToAction (Contentful block)
 * Craft: buttons (object of { label, ctaUrl, video, style }), layout, alignment
 * Contentful: callsToAction { blockId, blockName, callsToAction (array of Link to callsToActions), layout, alignment }
 * Nested: callsToActions { label, url, pageLink, mediaAsset, videoUrl, style }
 */
import {
  upsertEntry,
  makeLink,
  parseCraftLink,
  resolveInternalUrl,
  resolveEntryRef,
} from "../utils/contentfulHelpers.js";
import { getOrderedKeys } from "../utils/jsonOrder.js";

const LOCALE = "en-US";
const BLOCK_CONTENT_TYPE = "callsToAction";
const ITEM_CONTENT_TYPE = "callsToActions";

/** pageLink in callsToActions only allows these content types (Contentful schema) */
const ALLOWED_PAGE_LINK_TYPES = [
  "resourcesCpt",
  "newStandaloneContent",
  "newStandaloneMicrosite",
  "newStandaloneThankYou",
  "newStandaloneConversion",
  "newCompany",
  "company",
];

const LAYOUT_MAP = {
  default: "Inline",
  inline: "Inline",
  stacked: "Stacked",
};

const ALIGNMENT_MAP = {
  default: "Centered",
  left: "Left-aligned",
  center: "Centered",
  centered: "Centered",
  right: "Right-aligned",
};

const STYLE_MAP = {
  "button": "Gray",
  "button btn-white": "White",
  "button btn-gray": "Gray",
  "button btn-orange": "Orange",
  "button btn-solid-orange": "Solid Orange",
  "text": "Text Only",
  "text only": "Text Only",
  "textonly": "Text Only",
  "text-only": "Text Only",
  "gray": "Gray",
  "white": "White",
  "orange": "Orange",
  "solid orange": "Solid Orange",
  "solidorange": "Solid Orange",
};

const ALLOWED_STYLES = ["Text Only", "Gray", "White", "Orange", "Solid Orange"];

function normalizeLayout(value) {
  if (!value) return undefined;
  const key = String(value).toLowerCase().trim();
  return LAYOUT_MAP[key] || (value in LAYOUT_MAP ? LAYOUT_MAP[value] : value);
}

function normalizeAlignment(value) {
  if (!value) return undefined;
  const key = String(value).toLowerCase().trim();
  return ALIGNMENT_MAP[key] || value;
}

function normalizeStyle(value) {
  if (!value) return undefined;
  const key = String(value).toLowerCase().trim().replace(/\s+/g, "");
  const mapped = STYLE_MAP[key] || STYLE_MAP[String(value).toLowerCase().trim()] || value;
  return ALLOWED_STYLES.includes(mapped) ? mapped : STYLE_MAP["button"];
}

export async function createOrUpdateCallsToActionBlock(env, blockData, assetMap = null) {
  if (!env) {
    return { sys: { id: `dry-run-callsToAction-${blockData.blockId}` } };
  }

  try {
    await env.getContentType(BLOCK_CONTENT_TYPE);
    await env.getContentType(ITEM_CONTENT_TYPE);
  } catch (err) {
    console.warn(
      `   ⚠ callsToAction / callsToActions not found in Contentful: ${err.message}. Skipping.`
    );
    return null;
  }

  const blockId = blockData.blockId;
  const buttonsObj = blockData.buttons || {};
  const buttonIds = getOrderedKeys(blockData.blockSegment || "", buttonsObj);

  const itemLinks = [];
  for (const btnId of buttonIds) {
    const btn = buttonsObj[btnId];
    if (!btn?.fields) continue;

    const linkInfo = parseCraftLink(btn.fields.ctaUrl);
    let url = linkInfo.url || "";
    if (!url && linkInfo.linkedId) {
      url = resolveInternalUrl(linkInfo.linkedId) || "";
    }
    const label = btn.fields.label || linkInfo.label || "";

    // pageLink: only set when resolved entry type is allowed by callsToActions schema; otherwise clear it on update
    let pageLinkValue = null;
    if (linkInfo.linkedId) {
      const ref = resolveEntryRef(linkInfo.linkedId);
      if (ref?.id && ref.type && ALLOWED_PAGE_LINK_TYPES.includes(ref.type)) {
        pageLinkValue = makeLink(ref.id);
      }
      // If ref.type not allowed (e.g. newStTam), we set pageLink to null so update clears the invalid link
    }

    // mediaAsset: video from Craft
    let mediaAssetLink = null;
    const videoIds = btn.fields.video;
    if (Array.isArray(videoIds) && videoIds.length > 0 && assetMap) {
      const craftAssetId = String(videoIds[0]);
      const assetInfo = assetMap.get(craftAssetId);
      if (assetInfo?.id) {
        mediaAssetLink = { sys: { type: "Link", linkType: "Asset", id: assetInfo.id } };
      }
    }

    const itemFields = {
      label: { [LOCALE]: label },
      url: { [LOCALE]: url || "" },
    };
    if (pageLinkValue) {
      itemFields.pageLink = { [LOCALE]: pageLinkValue };
    } else if (linkInfo.linkedId) {
      itemFields.pageLink = { [LOCALE]: null };
    }
    if (mediaAssetLink) {
      itemFields.mediaAsset = { [LOCALE]: mediaAssetLink };
    }
    const style = normalizeStyle(btn.fields.style);
    if (style) {
      itemFields.style = { [LOCALE]: style };
    }

    const itemEntry = await upsertEntry(
      env,
      ITEM_CONTENT_TYPE,
      `cta-item-${blockId}-${btnId}`,
      itemFields,
      true
    );
    if (itemEntry?.sys?.id) {
      itemLinks.push(makeLink(itemEntry.sys.id));
    }
  }

  const fields = {
    blockId: { [LOCALE]: String(blockId) },
    blockName: { [LOCALE]: blockData.blockName || "Calls to Action" },
    callsToAction: { [LOCALE]: itemLinks },
  };

  const layout = normalizeLayout(blockData.layout);
  if (layout) {
    fields.layout = { [LOCALE]: layout };
  }
  const alignment = normalizeAlignment(blockData.alignment);
  if (alignment) {
    fields.alignment = { [LOCALE]: alignment };
  }

  return await upsertEntry(
    env,
    BLOCK_CONTENT_TYPE,
    `callstoaction-${blockId}`,
    fields,
    true
  );
}
