import { LOCALE, getOrCreateSeo, safeId, setSectionsOnPage, publishPage } from "./pageHandler.js";
import { upsertEntry, makeLink } from "../utils/contentfulHelpers.js";
import { getCategoryName } from "../utils/categoryLoader.js";
import { getTagNames, processTags } from "../utils/tagHandler.js";
import { COMPONENTS } from "../registry.js";
import { genericComponentHandler } from "./genericComponent.js";
import { getOrderedKeys } from "../utils/jsonOrder.js";

/**
 * Main function to migrate Video entries (NEW-Video CPT)
 */
export async function migrateVideos(
  env,
  videoData,
  assetMap = null,
  targetIndices = null,
  totalPages = null,
  summary = null,
  rawFileContent = null
) {
  const total = targetIndices
    ? targetIndices[targetIndices.length - 1] + 1
    : totalPages || videoData.length;
  
  console.log(`\n🎥 Starting Video Migration (${videoData.length} entries)...`);

  for (let i = 0; i < videoData.length; i++) {
    const item = videoData[i];
    const pageNum = targetIndices ? targetIndices[i] + 1 : i + 1;
    const progress = `[${pageNum} / ${total}]`;
    const shouldPublish = item.status === "live";

    console.log(
      `\n➡️ ${progress} Video: ${item.title} (ID: ${item.id}, Status: ${item.status})`,
    );

    const getPageSegment = (itemId) => {
      if (!rawFileContent) return "";
      const pIdIdx = rawFileContent.indexOf(`"id": ${itemId}`);
      if (pIdIdx === -1) return "";
      const nextPIdx = rawFileContent.indexOf('"id":', pIdIdx + 10);
      return rawFileContent.substring(pIdIdx, nextPIdx === -1 ? undefined : nextPIdx);
    };

    const pageSegment = getPageSegment(item.id);

    try {
      // 1. Prepare Main Fields
      const mainFields = {
        entryId: { [LOCALE]: String(item.id) },
        title: { [LOCALE]: item.title || "" },
        slug: { [LOCALE]: item.slug || "" },
        postDate: { [LOCALE]: item.postDate || null },
      };

      // 2. Handle Tags (Map IDs to comma-separated string)
      if (item.tags && item.tags.length > 0) {
        const tagNames = getTagNames(item.tags);
        mainFields.tags = { [LOCALE]: tagNames.join(", ") };
        console.log(`   🏷️  Tags: ${tagNames.join(", ")}`);
      }

      // 3. Handle SEO
      const seoEntry = await getOrCreateSeo(env, item, assetMap);
      if (seoEntry) {
        mainFields.seo = { [LOCALE]: makeLink(seoEntry.sys.id) };
      }

      // 5. Build Taxonomy Concepts metadata
      const metadata = { concepts: [], tags: [] };
      const conceptMapping = {
        "Use Cases": "useCases",
        "Manage passwords, secrets, & sessions": "managePasswordsSecretsSessions",
        "Enforce least privilege & JIT access": "enforceLeastPrivilegeJitAccess",
        "Improve identity security & posture": "improveIdentitySecurityPosture",
        "Meet compliance mandates": "meetComplianceMandates",
        "Secure all access: remote, OT, vendor, etc.": "secureAllAccessRemoteOtVendorEtc",
        "Support service desks, users, devices, & desktops": "supportServiceDesksUsersDevicesDesktops",
        "Content Type": "contentType",
        "Case Studies": "caseStudies",
        "Competitor Comparisons": "competitorComparisons",
        "Research & Reports": "researchReports",
        Webinars: "webinars",
        Videos: "videos",
        Products: "products",
        "Active Directory Bridge": "activeDirectoryBridge",
        "Endpoint Privilege Management": "endpointPrivilegeManagement",
        "Endpoint Privilege Management for Unix and Linux": "endpointPrivilegeManagementForUnixAndLinux",
        "Endpoint Privilege Management for Windows and Mac": "endpointPrivilegeManagementForWindowsAndMac",
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

      // 6. Build Environment Tags metadata (limit 100)
      if (item.tags) {
        const contentfulTags = await processTags(env, item.tags);
        metadata.tags = contentfulTags.slice(0, 100);
      }

      const finalMetadata = metadata.concepts.length === 0 && metadata.tags.length === 0 ? null : metadata;

      // 7. Upsert the Video Entry
      const videoEntry = await upsertEntry(
        env,
        "newVideoCpt",
        `video-${item.id}`,
        mainFields,
        shouldPublish,
        finalMetadata
      );

      if (!videoEntry) {
        throw new Error("Failed to create/update Video entry.");
      }

      // 8. Detect and Process Components (Matrix/Grid)
      // Even if they aren't in the user's Contentful snippet, we should process them
      // if they exist in the source JSON and the user decides to add them later.
      const sectionEntries = [];
      const componentFields = ["mainBannerResources", "defaultContentBlog", "modalFormsResources"];
      
      for (const fieldKey of componentFields) {
        const components = item[fieldKey];
        if (!components || typeof components !== "object") continue;

        const fieldIdx = pageSegment.indexOf(`"${fieldKey}":`);
        const fieldSegment = fieldIdx !== -1 ? pageSegment.substring(fieldIdx) : pageSegment;
        const orderedIds = getOrderedKeys(fieldSegment, components);

        for (const blockId of orderedIds) {
          const block = components[blockId];
          if (block.enabled === false) continue;

          const bType = block.type || fieldKey;
          const fields = block.fields || {};
          const config = COMPONENTS[bType];

          if (!config) {
            if (summary && !summary.missingMappings.has(bType)) {
              summary.missingMappings.set(bType, Object.keys(fields));
            }
            console.warn(`   ℹ️ skipping block: "${bType}" (no mapping)`);
            continue;
          }

          // Extract block segment for nested ordering
          const bIdx = fieldSegment.indexOf(`"${blockId}":`);
          const nextBId = orderedIds[orderedIds.indexOf(blockId) + 1];
          const nextBIdx = nextBId ? fieldSegment.indexOf(`"${nextBId}":`) : fieldSegment.length;
          const blockSegment = fieldSegment.substring(bIdx, nextBIdx);

          try {
            let componentEntry;
            if (config.handler === genericComponentHandler) {
              const entryId = await genericComponentHandler(
                env,
                { id: blockId, ...fields },
                config.mapping,
                assetMap,
                summary
              );
              if (entryId) componentEntry = await env.getEntry(entryId);
            } else {
              componentEntry = await config.handler(
                env,
                {
                  blockId: blockId,
                  blockSegment: blockSegment,
                  ...fields,
                  heading: fields.headingSection || fields.heading || item.title,
                  body: fields.bodyRedactorRestricted || fields.bodyMedium || fields.description || "",
                  label: fields.label || fields.ctaLinkText || "",
                  variation: bType,
                },
                assetMap,
                summary
              );
            }

            if (componentEntry) {
              // If the handler returns an array (e.g. results of nested components)
              if (Array.isArray(componentEntry)) {
                sectionEntries.push(...componentEntry);
              } else {
                sectionEntries.push(componentEntry);
              }
            }
          } catch (err) {
            console.error(`   🛑 Error processing block ${bType} (${blockId}):`, err.message);
          }
        }
      }

      // 6. Set Sections if any were found (Note: The user's snippet doesn't have a content field,
      // but if they add 'sections' or 'contentComponent', this will handle it)
      if (sectionEntries.length > 0) {
        await setSectionsOnPage(env, videoEntry, sectionEntries);
      }

      // 7. Publish
      await publishPage(env, videoEntry, item);

      console.log(`✅ Video "${item.title}" migrated.`);

    } catch (err) {
      console.error(`❌ Error migrating Video "${item.title}":`, err.message);
      if (summary) {
        summary.skipped.push({
          page: item.title,
          type: "Video",
          error: err.message
        });
      }
    }
  }
}
