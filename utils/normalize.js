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
