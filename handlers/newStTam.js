import { LOCALE, getOrCreateSeo, safeId, publishPage } from "./pageHandler.js";
import { upsertEntry, makeLink, resolveEntryRef } from "../utils/contentfulHelpers.js";
import { COMPONENTS } from "../registry.js";
import { genericComponentHandler } from "./genericComponent.js";
import { getOrderedKeys } from "../utils/jsonOrder.js";
import { convertHtmlToRichText } from "../utils/richText.js";

/**
 * Main function to migrate S&T TAM (Technical Account Management) entries
 */
export async function migrateStTam(
  env,
  data,
  assetMap = null,
  targetIndices = null,
  totalPages = null,
  summary = null,
  rawFileContent = null,
) {
  const total = targetIndices
    ? targetIndices[targetIndices.length - 1] + 1
    : totalPages || data.length;
  console.log(
    `\n📄 Starting S&T TAM Migration (${data.length} entries)...`,
  );

  for (let i = 0; i < data.length; i++) {
    const item = data[i];
    const pageNum = targetIndices ? targetIndices[i] + 1 : i + 1;
    const progress = `[${pageNum} / ${total}]`;
    const shouldPublish = item.status === "live";

    console.log(
      `\n➡️ ${progress} S&T TAM: ${item.title} (ID: ${item.id})`,
    );

    try {
      // 1. Process Rich Text and Basic Fields
      const introBodyHtml = item.bodyRedactorRestricted || "";
      const introBody = introBodyHtml
        ? await convertHtmlToRichText(env, introBodyHtml)
        : null;

      // 2. Create SEO
      const seoEntry = await getOrCreateSeo(env, item, assetMap);

      // 3. Resolve Company Quotes
      const companyQuotesLinks = [];
      if (item.companyQuotes && Array.isArray(item.companyQuotes)) {
        for (const quoteId of item.companyQuotes) {
          try {
            const quoteEntries = await env.getEntries({
              content_type: "quoteItem",
              "fields.entryId": String(quoteId),
              limit: 1,
            });
            if (quoteEntries.items.length > 0) {
              companyQuotesLinks.push(makeLink(quoteEntries.items[0].sys.id));
            }
          } catch (err) {
            console.warn(`   ⚠️ Could not resolve quote (ID: ${quoteId})`);
          }
        }
      }

      // 4. Process Components (Sections)
      const sectionEntries = [];

      const getPageSegment = (itemId) => {
        if (!rawFileContent) return "";
        const pIdIdx = rawFileContent.indexOf(`"id": ${itemId}`);
        if (pIdIdx === -1) return "";
        const nextPIdx = rawFileContent.indexOf('"id":', pIdIdx + 10);
        return rawFileContent.substring(
          pIdIdx,
          nextPIdx === -1 ? undefined : nextPIdx,
        );
      };
      const pageSegment = getPageSegment(item.id);

      // Detect component fields (slimBanner and servicesSideNavContent merge into sections)
      const componentFields = ["slimBanner", "servicesSideNavContent"];

      for (const fieldKey of componentFields) {
        const components = item[fieldKey];
        if (!components || typeof components !== "object") continue;

        const fIdx = pageSegment.indexOf(`"${fieldKey}":`);
        const fieldSegment =
          fIdx !== -1 ? pageSegment.substring(fIdx) : pageSegment;
        const orderedIds = getOrderedKeys(fieldSegment, components);

        for (const blockId of orderedIds) {
          const block = components[blockId];
          if (!block.enabled) continue;

          const blockType = block.type || fieldKey;

          const bIdx = fieldSegment.indexOf(`"${blockId}":`);
          const nextBId = orderedIds[orderedIds.indexOf(blockId) + 1];
          const nextBIdx = nextBId
            ? fieldSegment.indexOf(`"${nextBId}":`)
            : fieldSegment.length;
          const blockSegment = fieldSegment.substring(bIdx, nextBIdx);

          const fields = block.fields || {};
          const config = COMPONENTS[blockType] || COMPONENTS[fieldKey];

          if (!config) {
            console.warn(`   ℹ️ skipping block: "${blockType}" (no mapping)`);
            continue;
          }

          console.log(`   ✅ Detected "${blockType}" (ID: ${blockId})`);

          try {
            let entry;
            if (config.handler === genericComponentHandler) {
              const entryId = await genericComponentHandler(
                env,
                { id: blockId, ...fields, blockId: blockId },
                config.mapping,
                assetMap,
                summary,
              );
              if (entryId && env) {
                entry = await env.getEntry(entryId);
              } else if (entryId) {
                entry = { sys: { id: entryId } };
              }
            } else {
              entry = await config.handler(
                env,
                {
                  blockId,
                  blockSegment,
                  ...fields,
                  heading: fields.headingSection || fields.heading || "",
                  body: fields.body || fields.bodyRedactorRestricted || "",
                  label: fields.label || fields.ctaLinkText || "",
                  variation: blockType,
                },
                assetMap,
                summary,
              );
            }

            if (entry) {
              if (Array.isArray(entry)) {
                sectionEntries.push(...entry.map((e) => makeLink(e.sys.id)));
              } else {
                sectionEntries.push(makeLink(entry.sys.id));
              }
            }
          } catch (err) {
            console.error(
              `   🛑 Error processing block ${blockType} (${blockId}):`,
              err.message,
            );
          }
        }
      }

      // 5. Create Page Settings (pageSettingsSt)
      let pageSettingsLink = null;
      if (env) {
        const settingsId = safeId("settings-st", item.uri || item.slug);
        const settingsFields = {
          pageSetting: { [LOCALE]: `Settings: ${item.title}` },
          paragraphFontSize: { [LOCALE]: item.paragraphFontSize || "13px" },
        };
        if (seoEntry) {
          settingsFields.seo = { [LOCALE]: makeLink(seoEntry.sys.id) };
        }

        if (item.parentId || (item.sectionNavigationParent && item.sectionNavigationParent.length > 0)) {
          try {
            const parentId = item.parentId || item.sectionNavigationParent[0];
            const parentRef = resolveEntryRef(parentId);

            if (parentRef) {
              console.log(`   🔗 Linking parent page: ${parentId} -> ${parentRef.id} (${parentRef.type})`);
              settingsFields.parentPage = { [LOCALE]: makeLink(parentRef.id) };
            } else {
              // Fallback to API if not in cache (original logic)
              const parentEntries = await env.getEntries({
                "fields.entryId": String(parentId),
                limit: 1,
              });
              if (parentEntries.items.length > 0) {
                settingsFields.parentPage = {
                  [LOCALE]: makeLink(parentEntries.items[0].sys.id),
                };
              }
            }
          } catch (err) {
            console.warn(
              `   ⚠️ Could not resolve parent page for settings (ID: ${item.parentId || (item.sectionNavigationParent && item.sectionNavigationParent[0])})`,
            );
          }
        }

        const settingsEntry = await upsertEntry(
          env,
          "pageSettingsSt",
          settingsId,
          settingsFields,
          true,
        );
        if (settingsEntry) {
          pageSettingsLink = makeLink(settingsEntry.sys.id);
        }
      }

      // 6. Create Main page (newStTam)
      const mainFields = {
        entryId: { [LOCALE]: String(item.id) },
        title: { [LOCALE]: item.title || "" },
        slug: { [LOCALE]: item.uri || item.slug || "" },
        shortDescription: { [LOCALE]: item.body200 || "" },
        introHeading: { [LOCALE]: item.headingSection || "" },
        paragraphFontSize: { [LOCALE]: item.paragraphFontSize || "13px" },
      };

      if (introBody) {
        mainFields.introBody = { [LOCALE]: introBody };
      }
      if (pageSettingsLink) {
        mainFields.pageSettings = { [LOCALE]: pageSettingsLink };
      }
      if (sectionEntries.length > 0) {
        mainFields.sections = { [LOCALE]: sectionEntries };
      }
      if (companyQuotesLinks.length > 0) {
        mainFields.companyQuotes = { [LOCALE]: companyQuotesLinks };
      }

      const mainEntry = await upsertEntry(
        env,
        "newStTam",
        `st-tam-${item.id}`,
        mainFields,
        shouldPublish,
        null,
      );

      if (mainEntry && shouldPublish) {
        await publishPage(env, mainEntry, item);
      }

      console.log(`✅ S&T TAM "${item.title}" migrated.`);
    } catch (err) {
      console.error(
        `❌ Error migrating S&T TAM "${item.title}":`,
        err.message,
      );
    }
  }
}
