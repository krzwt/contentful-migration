// utils/normalize.js

export function isValidHttpUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function normalizeSrc(src) {
  if (!src) return null;
  return src.replace(/^\\?"|\\?"$/g, "").trim();
}

/**
 * Cleans Craft CMS reference tags from URLs in HTML source.
 * e.g. {entry:123@1:url||https://example.com} -> https://example.com
 * e.g. https://example.com#entry:123@1:url -> https://example.com
 */
export function cleanCraftUrls(html) {
  if (!html) return "";
  let cleaned = html;

  // 1. Resolve {entry:ID@SITE:url||FALLBACK} or {asset:ID:url||FALLBACK} to FALLBACK
  cleaned = cleaned.replace(/\{(?:entry|asset):[^|]+\|\|(.*?)\}/g, "$1");

  // 2. Remove entry/asset fragments (usually in URLs or alt tags)
  // e.g. #entry:123@1:url or #asset:55803
  cleaned = cleaned.replace(/#(?:entry|asset):\d+(@\d+)?(:url)?/g, "");

  return cleaned;
}

/**
 * Normalizes a URL by stripping known staging/production domains
 * to ensure relative paths are used for internal links.
 */
export function normalizeUrl(url) {
  if (!url) return "";
  let normalized = String(url).trim();

  // If the link points to a PDF, preserve the absolute URL
  // because PDFs may remain hosted on the legacy server
  if (normalized.toLowerCase().includes(".pdf")) {
    return normalized;
  }

  // Strip known domains to make links relative
  normalized = normalized
    .replace(/^https?:\/\/bluetext\.beyondtrust\.com/, "")
    .replace(/^https?:\/\/bluetext\.beyondtrust\.co/, "")
    .replace(/^https?:\/\/www\.beyondtrust\.com/, "");

  return normalized;
}

/**
 * Unwraps security-wrapped (Proofpoint/Urldefense) URLs and ensures path length safety.
 */
export function unwrapUrl(url, maxLength = 255) {
  if (!url) return "";
  let cleaned = String(url).trim();

  // Handle urldefense.com/v3/__[URL]__;!!...
  if (cleaned.includes("urldefense.com/v3/__")) {
    const match = cleaned.match(/urldefense\.com\/v3\/__(.*?)__/);
    if (match && match[1]) {
      cleaned = match[1];
    }
  }

  // Final length safety check for Contentful Symbol fields
  if (cleaned.length > maxLength) {
    return cleaned.substring(0, maxLength);
  }

  return cleaned;
}
