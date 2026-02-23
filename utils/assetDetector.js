/**
 * Extract all asset IDs from nested JSON structure
 */
export function extractAssets(obj, assetMap = new Map()) {
  if (!obj || typeof obj !== "object") return assetMap;

  for (const [key, value] of Object.entries(obj)) {
    // Check for asset arrays (image, video, pdf, etc.)
    if (Array.isArray(value) && ["image", "video", "pdf", "document", "personsPhoto", "logo", "quoteLogo"].includes(key)) {
      value.forEach(id => {
        if (typeof id === "number" || (typeof id === "string" && !isNaN(id))) {
          assetMap.set(String(id), { type: key, field: key });
        }
      });
    }

    // Check for entries array (linked content)
    if (key === "entries" && Array.isArray(value)) {
      value.forEach(id => {
        if (typeof id === "number") {
          assetMap.set(id, { type: "entry", field: "entries" });
        }
      });
    }

    // Recurse into nested objects/arrays
    if (typeof value === "object") {
      extractAssets(value, assetMap);
    }
  }

  return assetMap;
}

/**
 * Log all assets found in data
 */
export function logAssets(pages, assetMetadata = null) {
  const allAssets = new Map();

  pages.forEach(page => {
    const pageAssets = extractAssets(page);
    pageAssets.forEach((info, id) => {
      allAssets.set(id, { ...info, pageTitle: page.title });
    });
  });

  if (allAssets.size > 0) {
    console.log("\n📎 ASSETS DETECTED:");
    console.log("==================");
    allAssets.forEach((info, id) => {
      const meta = assetMetadata?.get(String(id));
      if (meta) {
        console.log(`   ${info.type.toUpperCase()}: ${id} - ${meta.title} (${meta.filename})`);
      } else {
        console.log(`   ${info.type.toUpperCase()}: ${id} - ⚠ No metadata found`);
      }
    });
    console.log("");
  }

  return allAssets;
}
