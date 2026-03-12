/**
 * Handler: pageSection (Craft) → pageSection (Contentful)
 * Craft: sectionHeading (text), sectionColor, sectionBackgroundImage, sectionBackgroundPattern, sectionImage, sectionLayout
 * Contentful: pageSection { blockId, blockName, sectionHeading (Link sectionTitle), sectionColor, sectionBackgroundImage (Asset), sectionBackgroundPattern, sectionImage (Asset), sectionLayout }
 */
import { upsertEntry, makeLink, upsertSectionTitle } from "../utils/contentfulHelpers.js";

const LOCALE = "en-US";
const CONTENT_TYPE = "pageSection";

const SECTION_COLOR_MAP = {
  white: "White",
  navy: "Navy",
  "light-gray": "Light Gray",
  "light grey": "Light Gray",
  black: "Black",
};

const SECTION_PATTERN_MAP = {
  none: "None",
  "curved-pattern": "Curved Pattern",
  "curved pattern": "Curved Pattern",
};

const SECTION_LAYOUT_MAP = {
  default: "Default (Left-aligned)",
  "default (left-aligned)": "Default (Left-aligned)",
  centered: "Centered",
  "right-aligned": "Right-aligned",
  right: "Right-aligned",
  left: "Default (Left-aligned)",
};

function normalizeSectionColor(value) {
  if (!value) return undefined;
  const key = String(value).toLowerCase().trim().replace(/\s+/g, "-");
  return SECTION_COLOR_MAP[key] || value;
}

function normalizeSectionPattern(value) {
  if (!value) return undefined;
  const key = String(value).toLowerCase().trim().replace(/\s+/g, "-");
  return SECTION_PATTERN_MAP[key] || value;
}

function normalizeSectionLayout(value) {
  if (!value) return undefined;
  const key = String(value).toLowerCase().trim().replace(/\s+/g, " ");
  return SECTION_LAYOUT_MAP[key] || SECTION_LAYOUT_MAP[value] || value;
}

export async function createOrUpdatePageSection(env, blockData, assetMap = null) {
  if (!env) {
    return { sys: { id: `dry-run-pageSection-${blockData.blockId}` } };
  }

  try {
    await env.getContentType(CONTENT_TYPE);
  } catch (err) {
    console.warn(
      `   ⚠ pageSection not found in Contentful: ${err.message}. Skipping.`
    );
    return null;
  }

  const blockId = blockData.blockId;

  // Section Heading: Link to sectionTitle (create from Craft sectionHeading text)
  let sectionHeadingLink = null;
  const headingText = blockData.sectionHeading;
  if (headingText) {
    const titleEntry = await upsertSectionTitle(env, blockId, headingText);
    if (titleEntry?.sys?.id) {
      sectionHeadingLink = makeLink(titleEntry.sys.id);
    }
  }

  // Section Background Image: Asset link (only when in map to avoid notResolvable)
  let sectionBackgroundImageLink = null;
  const bgImageIds = blockData.sectionBackgroundImage;
  if (Array.isArray(bgImageIds) && bgImageIds.length > 0 && assetMap?.has(String(bgImageIds[0]))) {
    const id = assetMap.get(String(bgImageIds[0])).id;
    sectionBackgroundImageLink = { sys: { type: "Link", linkType: "Asset", id } };
  }

  // Section Image: Asset link (only when in map)
  let sectionImageLink = null;
  const sectionImageIds = blockData.sectionImage;
  if (Array.isArray(sectionImageIds) && sectionImageIds.length > 0 && assetMap?.has(String(sectionImageIds[0]))) {
    const id = assetMap.get(String(sectionImageIds[0])).id;
    sectionImageLink = { sys: { type: "Link", linkType: "Asset", id } };
  }

  const fields = {
    blockId: { [LOCALE]: String(blockId) },
    blockName: { [LOCALE]: blockData.blockName || blockData.sectionHeading || "Page Section" },
  };

  if (sectionHeadingLink) {
    fields.sectionHeading = { [LOCALE]: sectionHeadingLink };
  }
  const sectionColor = normalizeSectionColor(blockData.sectionColor);
  if (sectionColor) {
    fields.sectionColor = { [LOCALE]: sectionColor };
  }
  if (sectionBackgroundImageLink) {
    fields.sectionBackgroundImage = { [LOCALE]: sectionBackgroundImageLink };
  }
  const sectionBackgroundPattern = normalizeSectionPattern(blockData.sectionBackgroundPattern);
  if (sectionBackgroundPattern) {
    fields.sectionBackgroundPattern = { [LOCALE]: sectionBackgroundPattern };
  }
  if (sectionImageLink) {
    fields.sectionImage = { [LOCALE]: sectionImageLink };
  }
  const sectionLayout = normalizeSectionLayout(blockData.sectionLayout);
  if (sectionLayout) {
    fields.sectionLayout = { [LOCALE]: sectionLayout };
  }

  return await upsertEntry(
    env,
    CONTENT_TYPE,
    `pagesection-${blockId}`,
    fields,
    true
  );
}
