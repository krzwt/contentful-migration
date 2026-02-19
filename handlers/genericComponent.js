import { convertHtmlToRichText } from "../utils/richText.js";

const LOCALE = "en-US";

/**
 * Generic handler driven by mapping JSON
 * Works for text + richText fields (and can accept an optional asset map)
 */
export async function genericComponentHandler(env, block, mapping, assetMap = null) {
  const blockIdValue = String(block[mapping.idField] || "").trim();
  if (!blockIdValue) return null;

  // 🔍 Safe query (blockId MUST be Short text)
  let existing = { items: [] };
  try {
    existing = await env.getEntries({
      content_type: mapping.contentType,
      "fields.blockId": blockIdValue,
      limit: 1
    });
  } catch (err) {
    if (err.name === "NotFound" || err.name === "BadRequest" || err.name === "InvalidQuery") {
      console.warn(`⚠ Content Type "${mapping.contentType}" not found or invalid in this environment. Skipping...`);
      return null;
    }
    throw err;
  }

  const fields = { blockId: { [LOCALE]: blockIdValue } };

  for (const [fieldId, cfg] of Object.entries(mapping.fields)) {
    if (fieldId === "blockId") continue;

    // Handle multiple source fields (first match wins)
    let value = null;
    if (Array.isArray(cfg.from)) {
      for (const source of cfg.from) {
        if (block[source] !== undefined && block[source] !== null) {
          value = block[source];
          break;
        }
      }
    } else {
      value = block[cfg.from];
    }

    if ((value === null || value === undefined || value === "") && cfg.default !== undefined) {
      value = cfg.default;
    }

    if (cfg.type === "asset") {
      let assetId = null;
      if (value && typeof value === 'object') {
        const findId = (obj) => {
          if (!obj) return null;
          if (Array.isArray(obj.image) && obj.image.length > 0) return obj.image[0];
          if (Array.isArray(obj.video) && obj.video.length > 0) return obj.video[0];
          for (const key of Object.keys(obj)) {
            if (typeof obj[key] === 'object') {
              const found = findId(obj[key]);
              if (found) return found;
            }
          }
          return null;
        };
        assetId = findId(value);
      }

      if (assetId) {
        const assetInfo = assetMap && assetMap.get(String(assetId));

        if (assetInfo && assetInfo.id) {
          const isSupportedAsset = assetInfo.mimeType.startsWith("image/") ||
            assetInfo.mimeType.startsWith("video/") ||
            assetInfo.mimeType === "application/json";

          if (isSupportedAsset) {
            fields[fieldId] = {
              [LOCALE]: {
                sys: {
                  type: "Link",
                  linkType: "Asset",
                  id: assetInfo.id
                }
              }
            };
          } else {
            console.warn(`   ⚠ Skipping Asset: ${assetId} for ${fieldId} - Invalid MimeType: ${assetInfo.mimeType}`);
            fields[fieldId] = { [LOCALE]: null };
          }
        } else {
          fields[fieldId] = { [LOCALE]: null };
        }
      } else {
        fields[fieldId] = { [LOCALE]: null };
      }
      continue;
    }

    if (cfg.type === "richText") {
      if (typeof value === 'string' && value.includes('<')) {
        fields[fieldId] = {
          [LOCALE]: await convertHtmlToRichText(env, value)
        };
      } else {
        const textValue = (value && typeof value === 'object') ? JSON.stringify(value, null, 2) : String(value ?? "");
        fields[fieldId] = {
          [LOCALE]: {
            nodeType: "document",
            data: {},
            content: [{
              nodeType: "paragraph",
              data: {},
              content: [{
                nodeType: "text",
                value: textValue,
                marks: [],
                data: {}
              }]
            }]
          }
        };
      }
    } else if (cfg.type === "boolean") {
      // Cast to boolean
      fields[fieldId] = {
        [LOCALE]: !!value
      };
    } else if (cfg.type === "variant") {
      // Handle variant mapping
      let variant = "Banner Slim"; // Default
      const v = String(value || "").toLowerCase();
      if (v.includes("right")) variant = "Banner Media Right";
      else if (v.includes("center")) variant = "Banner Media Center";
      else if (v.includes("slim")) variant = "Banner Slim";

      fields[fieldId] = { [LOCALE]: variant };
    } else {
      // Plain text field
      if (value && typeof value === 'object') {
        value = JSON.stringify(value, null, 2);
      }

      // ONLY set if we have a value and it's not empty string (to avoid validation errors on enums)
      if (value !== null && value !== undefined && value !== "") {
        fields[fieldId] = {
          [LOCALE]: String(value)
        };
      }
    }
  }

  // UPDATE
  if (existing.items.length) {
    const entry = existing.items[0];
    console.log(`🔄 Updating existing ${mapping.contentType}:`, entry.sys.id);
    entry.fields = {
      ...entry.fields,
      ...fields
    };
    await (await entry.update()).publish();
    return entry.sys.id;
  }

  // CREATE
  console.log(`✨ Creating new ${mapping.contentType}`);
  const entry = await env.createEntry(mapping.contentType, {
    fields
  })

  await entry.publish();
  return entry.sys.id;
}
