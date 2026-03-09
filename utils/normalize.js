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
