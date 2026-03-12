import { LOCALE, getOrCreateSeo, safeId } from "./pageHandler.js";
import { upsertEntry, makeLink } from "../utils/contentfulHelpers.js";
import { getCategoryName, getCategory } from "../utils/categoryLoader.js";
import {
  processTags,
  loadTagMapping,
  getTagNames,
} from "../utils/tagHandler.js";
import { COMPONENTS } from "../registry.js";
import { genericComponentHandler } from "./genericComponent.js";
import { getOrderedKeys } from "../utils/jsonOrder.js";

/**
 * Main function to migrate Resource entries
 */
export async function migrateResources(
  env,
  resourceData,
  assetMap = null,
  targetIndices = null,
  totalPages = null,
  summary = null,
  rawFileContent = null
) {
  const total = targetIndices
    ? targetIndices[targetIndices.length - 1] + 1
    : totalPages || resourceData.length;
  console.log(
    `\n📚 Starting Resource Migration (${resourceData.length} entries)...`,
  );

  for (let i = 0; i < resourceData.length; i++) {
    const item = resourceData[i];
    const pageNum = targetIndices ? targetIndices[i] + 1 : i + 1;
    const progress = `[${pageNum} / ${total}]`;
    const shouldPublish = item.status === "live";

    const typeMap = {
      4: "Resources",
      22: "Infographics",
      24: "Whitepapers",
      25: "Datasheets",
      26: "Videos",
      27: "Competitor Comparisons",
      29: "Case Studies",
      23: "Webinars",
    };

    let typeLabel = typeMap[item.typeId] || "Resources";

    // Only refine from General Categories when typeId is missing or not in typeMap (so typeId wins)
    if ((item.typeId == null || !(item.typeId in typeMap)) && item.generalCategories) {
      const validTypes = [
        "Resources",
        "Case Studies",
        "Competitor Comparisons",
        "Datasheets",
        "Infographics",
        "Videos",
        "Whitepapers",
        "Webinars",
      ];
      for (const catId of item.generalCategories) {
        const cat = getCategory(catId);
        if (cat && cat.parentId === 1836820) {
          let catTitle = cat.title.replace(/&amp;/g, "&");
          if (catTitle === "Research & Reports") {
            catTitle = "Whitepapers"; // Fallback mapping for missing dropdown option
          }
          if (validTypes.includes(catTitle)) {
            typeLabel = catTitle;
          }
          break;
        }
      }
    }

    console.log(
      `\n➡️ ${progress} ${typeLabel}: ${item.title} (ID: ${item.id}, Status: ${item.status})`,
    );

    // Log Categories for Taxonomy check
    if (item.generalCategories && item.generalCategories.length > 0) {
      const catNames = item.generalCategories
        .map((id) => getCategoryName(id))
        .filter(Boolean);
      console.log(`   🏷️  Categories: ${catNames.join(", ")}`);
    }

    const getPageSegment = (itemId) => {
      if (!rawFileContent) return "";
      const pIdIdx = rawFileContent.indexOf(`"id": ${itemId}`);
      if (pIdIdx === -1) return "";
      const nextPIdx = rawFileContent.indexOf('"id":', pIdIdx + 10);
      return rawFileContent.substring(pIdIdx, nextPIdx === -1 ? undefined : nextPIdx);
    };

    const pageSegment = getPageSegment(item.id);

    try {
      // 1. Create Webcast Info if it exists
      const webcastInfoIds = [];
      if (item.webcastInfo) {
        const wiIdx = pageSegment.indexOf('"webcastInfo":');
        const wiSegment = wiIdx !== -1 ? pageSegment.substring(wiIdx) : pageSegment;
        const orderedWiIds = getOrderedKeys(wiSegment, item.webcastInfo);

        const tzMap = {
          ET: "Eastern (US & Canada)",
          CT: "Central (US & Canada)",
          MT: "Mountain (US & Canada",
          PT: "Pacific (US & Canada)",
          WET: "Western Europe",
          CET: "Central Europe",
          brasilia: "Brasilia",
          SGT: "Singapore",
          GST: "Gulf Standard Time",
          EET: "Eastern Europe",
        };

        for (const blockId of orderedWiIds) {
          const webcastData = item.webcastInfo[blockId];
          if (webcastData.fields) {
            const rawTz = webcastData.fields.webcastTimezone;
            const mappedTz = tzMap[rawTz] || "Eastern (US & Canada)";

            const webcastFields = {
              webcastTimezone: { [LOCALE]: mappedTz },
            };

            if (webcastData.fields.webcastId) {
              webcastFields.webcastId = {
                [LOCALE]: String(webcastData.fields.webcastId),
              };
            } else {
              webcastFields.webcastId = { [LOCALE]: null };
            }
            const webcastEntry = await upsertEntry(
              env,
              "webcastInfo",
              `webcast-${blockId}`,
              webcastFields,
              shouldPublish,
            );
            if (webcastEntry) webcastInfoIds.push(webcastEntry.sys.id);
          }
        }
      }

      // 2. Create Resource Fields Component
      const resourceFields = {
        resourceTitle: { [LOCALE]: item.resourceTitle || item.title || "" },
        resourceDescription: { [LOCALE]: item.resourceDescription || "" },
        signup: { [LOCALE]: !!item.signupRequired },
        salesforceCampaignId: { [LOCALE]: item.salesforceCampaignId || "" },
        resourceTranscript: { [LOCALE]: item.resourceTranscript || "" },
        timeOverride: { [LOCALE]: item.timeOverride || "" },
      };

      // Only set asset/link fields when the target exists in the map (resolvable); otherwise skip to avoid notResolvable on publish
      if (item.resourceCardImage && item.resourceCardImage[0]) {
        const craftAssetId = String(item.resourceCardImage[0]);
        if (assetMap?.has(craftAssetId)) {
          const contentfulAssetId = assetMap.get(craftAssetId).id;
          resourceFields.resourceCardImage = {
            [LOCALE]: {
              sys: { type: "Link", linkType: "Asset", id: contentfulAssetId },
            },
          };
        } else {
          console.warn(
            `   ⚠️ Asset ${craftAssetId} not in map, skipping resourceCardImage (omit to avoid notResolvable).`,
          );
        }
      }
      if (
        (item.resourceBannerImage && item.resourceBannerImage[0]) ||
        (item.resourceBannerBackground && item.resourceBannerBackground[0])
      ) {
        const craftAssetId = String(
          item.resourceBannerImage?.[0] || item.resourceBannerBackground?.[0],
        );
        if (assetMap?.has(craftAssetId)) {
          const contentfulAssetId = assetMap.get(craftAssetId).id;
          resourceFields.resourceBannerImage = {
            [LOCALE]: {
              sys: { type: "Link", linkType: "Asset", id: contentfulAssetId },
            },
          };
        } else {
          console.warn(
            `   ⚠️ Asset ${craftAssetId} not in map, skipping resourceBannerImage (omit to avoid notResolvable).`,
          );
        }
      }
      if (item.resourceDocument && item.resourceDocument[0]) {
        const craftAssetId = String(item.resourceDocument[0]);
        if (assetMap?.has(craftAssetId)) {
          const contentfulAssetId = assetMap.get(craftAssetId).id;
          resourceFields.resourceDocument = {
            [LOCALE]: {
              sys: { type: "Link", linkType: "Asset", id: contentfulAssetId },
            },
          };
        } else {
          console.warn(
            `   ⚠️ Asset ${craftAssetId} not in map, skipping resourceDocument (omit to avoid notResolvable).`,
          );
        }
      }
      if (item.resourceVideo && item.resourceVideo[0]) {
        const craftAssetId = String(item.resourceVideo[0]);
        console.warn(
          `   ⚠️ resourceVideo (asset ${craftAssetId}) skipped: link requires resolvable "asset" Entry (not set to avoid notResolvable).`,
        );
        resourceFields.resourceVideo = { [LOCALE]: null };
      }

      if (item.tags) {
        const tagNames = getTagNames(item.tags);
        const tagsString = tagNames.join(", ");
        console.log(
          `   📝 Preparing comma-separated tags: "${tagsString.substring(0, 50)}..."`,
        );

        const tagsEntry = await upsertEntry(
          env,
          "tags",
          `tags-entry-${item.id}`,
          { tags: { [LOCALE]: tagsString } },
          true,
        );

        if (tagsEntry) {
          resourceFields.tags = { [LOCALE]: makeLink(tagsEntry.sys.id) };
        }
      }

      const resourceFieldsEntry = await upsertEntry(
        env,
        "resourcesFields",
        `rf-${item.id}`,
        resourceFields,
        true,
      );

      if (!resourceFieldsEntry) {
        throw new Error("Failed to create Resources Fields entry.");
      }

      // 3. Create Main Entry
      const mainFields = {
        entryId: { [LOCALE]: String(item.id) },
        title: { [LOCALE]: item.title || "" },
        slug: { [LOCALE]: item.uri || item.slug || "" },
        resourcesFields: { [LOCALE]: makeLink(resourceFieldsEntry.sys.id) },
      };

      if (item.postDate) {
        const d = new Date(item.postDate);
        if (!isNaN(d.getTime())) {
          mainFields.postDate = { [LOCALE]: d.toISOString().slice(0, 10) };
        }
      }

      // 3.1 Create modular content (sections = "Resource Content" in Contentful)
      const sectionEntries = [];
      if (item.mixedContent) {
        const mcIdx = pageSegment.indexOf('"mixedContent":');
        const mcSegment = mcIdx !== -1 ? pageSegment.substring(mcIdx) : pageSegment;
        const orderedBlockIds = getOrderedKeys(mcSegment, item.mixedContent);

        for (const blockId of orderedBlockIds) {
          const block = item.mixedContent[blockId];
          if (block.enabled === false) continue;

          // Extract block segment for nested ordering (e.g. grid items)
          const bIdx = mcSegment.indexOf(`"${blockId}":`);
          const nextBId = orderedBlockIds[orderedBlockIds.indexOf(blockId) + 1];
          const nextBIdx = nextBId ? mcSegment.indexOf(`"${nextBId}":`) : mcSegment.length;
          const blockSegment = mcSegment.substring(bIdx, nextBIdx);

          const type = block.type;
          const fields = block.fields || {};
          const config = COMPONENTS[type];

          if (!config) {
            console.warn(
              `   ℹ️ skipping modular block: "${type}" (no mapping)`,
            );
            continue;
          }

          try {
            let componentEntry;
            if (config.handler === genericComponentHandler) {
              const entryId = await genericComponentHandler(
                env,
                { id: blockId, ...fields },
                config.mapping,
                assetMap,
              );
              if (entryId) {
                componentEntry = await env.getEntry(entryId);
              }
            } else {
              const handlerPayload = {
                blockId: blockId,
                blockSegment: blockSegment,
                ...fields,
                heading: fields.blockHeading || fields.headingSection || "",
                body:
                  fields.blockBody ||
                  fields.body ||
                  fields.bodyRedactorRestricted ||
                  "",
                label: fields.label || fields.ctaLinkText || "",
                variation: type,
              };
              if (type === "contentBlock") {
                handlerPayload._targetContentType = "contentBlocks";
              }
              componentEntry = await config.handler(env, handlerPayload, assetMap);
            }

            if (componentEntry) {
              const entries = Array.isArray(componentEntry) ? componentEntry : [componentEntry];
              for (const e of entries) {
                if (e?.sys?.id) sectionEntries.push(makeLink(e.sys.id));
              }
            }
          } catch (err) {
            console.error(
              `   🛑 Error processing block ${type} (${blockId}):`,
              err.message,
            );
          }
        }
      }
      if (sectionEntries.length > 0) {
        mainFields.sections = { [LOCALE]: sectionEntries };
      }

      // 3.2 Handle SEO
      const seoEntry = await getOrCreateSeo(env, item, assetMap);
      if (seoEntry) {
        mainFields.seo = { [LOCALE]: makeLink(seoEntry.sys.id) };
      }

      const metadata = { concepts: [], tags: [] };

      // 4. Build Taxonomy Concepts metadata
      const conceptMapping = {
        "Use Cases": "useCases",
        "Manage passwords, secrets, & sessions":
          "managePasswordsSecretsSessions",
        "Enforce least privilege & JIT access":
          "enforceLeastPrivilegeJitAccess",
        "Improve identity security & posture": "improveIdentitySecurityPosture",
        "Meet compliance mandates": "meetComplianceMandates",
        "Secure all access: remote, OT, vendor, etc.":
          "secureAllAccessRemoteOtVendorEtc",
        "Support service desks, users, devices, & desktops":
          "supportServiceDesksUsersDevicesDesktops",
        "Content Type": "contentType",
        "Case Studies": "caseStudies",
        "Competitor Comparisons": "competitorComparisons",
        "Research & Reports": "researchReports",
        Webinars: "webinars",
        Videos: "videos",
        Products: "products",
        "Active Directory Bridge": "activeDirectoryBridge",
        "Endpoint Privilege Management": "endpointPrivilegeManagement",
        "Endpoint Privilege Management for Unix and Linux":
          "endpointPrivilegeManagementForUnixAndLinux",
        "Endpoint Privilege Management for Windows and Mac":
          "endpointPrivilegeManagementForWindowsAndMac",
        Entitle: "entitle",
        "Identity Security Insights": "identitySecurityInsights",
        "Password Safe": "passwordSafe",
        "Privileged Remote Access": "privilegedRemoteAccess",
        "Remote Support": "remoteSupport",
        Industries: "industries",
        Education: "education",
        "Energy and Utilities": "energyAndUtilities",
        "Financial Services": "financialServices",
        Government: "government",
        Healthcare: "healthcare",
        "High Tech": "highTech",
        Manufacturing: "manufacturing",
        "Retail & Hospitality": "retailHospitality",
      };

      if (item.generalCategories) {
        for (const catId of item.generalCategories) {
          const catName = getCategoryName(catId);
          const conceptId = conceptMapping[catName];
          if (conceptId) {
            metadata.concepts.push({
              sys: { type: "Link", linkType: "TaxonomyConcept", id: conceptId },
            });
          }
        }
      }

      // 5. Build Environment Tags metadata
      if (item.tags) {
        const contentfulTags = await processTags(env, item.tags);
        // Contentful has a limit of 100 tags per entry
        metadata.tags = contentfulTags.slice(0, 100);
      }

      // Cleanup empty metadata
      // Contentful API requires the 'tags' property to be present if 'metadata' is sent, even if empty.
      // Same for 'concepts' if you are using taxonomy.
      const finalMetadata =
        metadata.concepts.length === 0 && metadata.tags.length === 0
          ? null
          : metadata;

      // All items (including former webinars) → resourcesCpt only; resourceWebinarsCpt no longer used
      mainFields.resourceType = { [LOCALE]: typeLabel };
      await upsertEntry(
        env,
        "resourcesCpt",
        `resource-${item.id}`,
        mainFields,
        shouldPublish,
        finalMetadata,
      );

      console.log(
        `✅ ${typeLabel} "${item.title}" migrated (${shouldPublish ? "Published" : "Draft"}).`,
      );
    } catch (err) {
      console.error(
        `❌ Error migrating ${typeLabel} "${item.title}":`,
        err.message,
      );
    }
  }
}
