import { convertHtmlToRichText } from "../utils/richText.js";
import { upsertSectionTitle, makeLink } from "../utils/contentfulHelpers.js";

const LOCALE = "en-US";

/**
 * Generic handler driven by mapping JSON
 * Works for text + richText fields (and can accept an optional asset map)
 */
export async function genericComponentHandler(env, block, mapping, assetMap = null, summary = null) {
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

  // #region agent log
  if (mapping.contentType === "embeds") {
    fetch('http://127.0.0.1:7309/ingest/588f7aad-24fa-4765-a619-4f0aa82527cf', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-Session-Id': 'c19fb8'
      },
      body: JSON.stringify({
        sessionId: 'c19fb8',
        runId: 'pre-fix',
        hypothesisId: 'H1',
        location: 'handlers/genericComponent.js:fields-init',
        message: 'Embeds generic handler - initial block values',
        data: {
          blockIdValue,
          mappingContentType: mapping.contentType,
          rawSectionTitle:
            block.headingSection || block.title || block.blockHeading || null
        },
        timestamp: Date.now()
      })
    }).catch(() => {});
  }
  // #endregion

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

    // Special-case: embeds.sectionTitle must be a Link -> sectionTitle entry
    if (mapping.contentType === "embeds" && fieldId === "sectionTitle") {
      if (value !== null && value !== undefined && value !== "") {
        const titleEntry = await upsertSectionTitle(env, blockIdValue, String(value));

        // #region agent log
        fetch('http://127.0.0.1:7309/ingest/588f7aad-24fa-4765-a619-4f0aa82527cf', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Debug-Session-Id': 'c19fb8'
          },
          body: JSON.stringify({
            sessionId: 'c19fb8',
            runId: 'pre-fix',
            hypothesisId: 'H2',
            location: 'handlers/genericComponent.js:embeds-sectionTitle',
            message: 'Embeds handler - created/linked sectionTitle entry',
            data: {
              blockIdValue,
              rawTitle: String(value),
              titleEntryId: titleEntry?.sys?.id || null
            },
            timestamp: Date.now()
          })
        }).catch(() => {});
        // #endregion

        if (titleEntry && titleEntry.sys && titleEntry.sys.id) {
          fields[fieldId] = {
            [LOCALE]: makeLink(titleEntry.sys.id)
          };
        }
      }
      continue;
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

    if (cfg.type === "entryArray") {
      let linkedIds = Array.isArray(value) ? value : (value ? [value] : []);
      let references = [];
      for (const linkedId of linkedIds) {
        if (!linkedId) continue;
        const linkedIdStr = String(linkedId);

        let existingLinked = { items: [] };
        try {
          existingLinked = await env.getEntries({
            content_type: cfg.linkedContentType,
            "fields.entryId": linkedIdStr,
            limit: 1
          });
        } catch (err) {
          console.warn(`   ⚠ Error searching for ${cfg.linkedContentType} with entryId ${linkedIdStr}`);
        }

        if (existingLinked.items.length > 0) {
          references.push({
            sys: { type: "Link", linkType: "Entry", id: existingLinked.items[0].sys.id }
          });
        } else {
          console.log(`   ⚠️ ${cfg.linkedContentType} (entryId: ${linkedIdStr}) not found in Contentful. Creating a stub...`);
          try {
            const stubEntry = await env.createEntry(cfg.linkedContentType, {
              fields: {
                entryId: { [LOCALE]: linkedIdStr },
                title: { [LOCALE]: `Embed ${linkedIdStr}` }
              }
            });
            await stubEntry.publish();
            references.push({
              sys: { type: "Link", linkType: "Entry", id: stubEntry.sys.id }
            });
          } catch (stubErr) {
            console.error(`   🛑 Error creating stub for ${linkedIdStr}:`, stubErr.message);
          }
        }
      }

      if (references.length > 0) {
        fields[fieldId] = { [LOCALE]: references };
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

  // #region agent log
  if (mapping.contentType === "embeds") {
    fetch('http://127.0.0.1:7309/ingest/588f7aad-24fa-4765-a619-4f0aa82527cf', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-Session-Id': 'c19fb8'
      },
      body: JSON.stringify({
        sessionId: 'c19fb8',
        runId: 'pre-fix',
        hypothesisId: 'H1',
        location: 'handlers/genericComponent.js:fields-before-save',
        message: 'Embeds generic handler - final fields snapshot',
        data: {
          blockIdValue,
          hasSectionTitle: Object.prototype.hasOwnProperty.call(fields, "sectionTitle"),
          sectionTitleField: fields.sectionTitle || null,
          fieldKeys: Object.keys(fields)
        },
        timestamp: Date.now()
      })
    }).catch(() => {});
  }
  // #endregion

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
