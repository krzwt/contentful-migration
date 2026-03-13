import fs from "fs";
import {
  upsertEntry,
  makeLink,
  resolveInternalUrl,
  upsertAssetWrapper,
  upsertCta,
  upsertSectionTitle,
  parseCraftLink,
  resolveEntryRef,
} from "../utils/contentfulHelpers.js";
import { getOrderedKeys } from "../utils/jsonOrder.js";
import { COMPONENTS } from "../registry.js";
import { genericComponentHandler } from "./genericComponent.js";
import { convertHtmlToRichText } from "../utils/richText.js";
import { getOrCreateSeo } from "./pageHandler.js";
import { getCategoryName } from "../utils/categoryLoader.js";
import { unwrapUrl } from "../utils/normalize.js";

const LOCALE = "en-US";
const CONTENT_TYPE = "newPressMediaCpt";

/**
 * Mapping for typeId to entryType
 */
const ENTRY_TYPE_MAP = {
  147: "Press Release", // pressRelease
  148: "Listing", // pressListing
  149: "Media Coverage", // mediaCoverage
  146: "Media Assets", // mediaAssets
  151: "Boilerplate",
};

// Load Press & Media Categories for mapping
const PRESS_CATS_FILE = "./data/taxonomy-pressMediaCategories.json";
let pressCategoriesData = [];
if (fs.existsSync(PRESS_CATS_FILE)) {
  try {
    pressCategoriesData = JSON.parse(fs.readFileSync(PRESS_CATS_FILE, "utf-8"));
  } catch (err) {
    console.warn(`⚠️ Error loading press categories: ${err.message}`);
  }
}

/**
 * Specific migration handler for Press & Media content
 */
export async function migratePressMedia(
  env,
  data,
  assetMap,
  targetIndices,
  totalPages,
  summary,
  rawFileContent,
) {
  console.log(`\n🚀 Migrating ${data.length} Press & Media entries...`);

  for (let i = 0; i < data.length; i++) {
    const item = data[i];
    const pageNum = targetIndices[i] + 1;
    console.log(
      `\n➡️ [${pageNum} / ${totalPages}] Press Item: ${item.title} (ID: ${item.id})`,
    );

    if (!env) {
      console.log(`   [DRY RUN] Would migrate Press Item: ${item.title}`);
      continue;
    }

    const entryId = `press-${item.id}`;

    // 1. Map entryType
    const entryType = ENTRY_TYPE_MAP[String(item.typeId)] || "Press Release";

    // 2. Map mediaContact (sourcePerson)
    let mediaContactLink = null;
    if (item.sourcePerson && item.sourcePerson.length > 0) {
      const personId = String(item.sourcePerson[0]);
      try {
        const personEntries = await env.getEntries({
          content_type: "peopleCpt",
          "fields.entryId": personId,
          limit: 1,
        });
        if (personEntries.items.length > 0) {
          mediaContactLink = makeLink(personEntries.items[0].sys.id);
        } else {
          console.warn(
            `   ⚠️ Person ID ${personId} not found in Contentful for mediaContact`,
          );
        }
      } catch (err) {
        console.warn(
          `   ⚠️ Error looking up person ${personId}: ${err.message}`,
        );
      }
    }

    // 3. Map mediaLogo (companyLogo)
    let mediaLogoLink = null;
    if (item.companyLogo && item.companyLogo.length > 0 && assetMap) {
      const assetId = String(item.companyLogo[0]);
      const assetInfo = assetMap.get(assetId);
      if (assetInfo && assetInfo.id) {
        mediaLogoLink = makeLink(assetInfo.id, "Asset");
      }
    }

    // 4. Process Components (mainBannerPress + detailsContentPress + sideNavContentPress)
    const contentComponents = [];

    const processMatrix = async (fieldName) => {
      const matrix = item[fieldName];
      if (
        !matrix ||
        typeof matrix !== "object" ||
        Object.keys(matrix).length === 0
      )
        return;

      // Find segment in raw file for ordering
      const pIdx = rawFileContent.indexOf(`"id": ${item.id}`);
      if (pIdx === -1) return;
      const fIdx = rawFileContent.indexOf(`"${fieldName}":`, pIdx);
      if (fIdx === -1) return;
      const nextPIdx = rawFileContent.indexOf('"id":', fIdx + 20);
      const fieldSegment = rawFileContent.substring(
        fIdx,
        nextPIdx === -1 ? undefined : nextPIdx,
      );

      const orderedIds = getOrderedKeys(fieldSegment, matrix);

      for (const blockId of orderedIds) {
        const block = matrix[blockId];
        if (!block.enabled) continue;

        let bType = block.type;

        // Special mapping logic for Matrix fields in Press Template
        if (
          fieldName === "mainBannerPress" &&
          (bType === "bannerSlim" || bType === "bannerHero")
        ) {
          bType = "mainBannerPress";
        }

        const config =
          COMPONENTS[bType] ||
          (bType === "mainBannerPress"
            ? { handler: createOrUpdatePressBanner }
            : null) ||
          (bType === "assetGrid" ? { handler: createOrUpdateAssetGrid } : null) ||
          (bType === "biography" ? { handler: createOrUpdateBiography } : null) ||
          (bType === "contentSummary"
            ? { handler: createOrUpdateContentSummary }
            : null);

        if (config) {
          console.log(
            `   ✅ Processing ${bType} (${blockId}) for field "${fieldName}"`,
          );
          let componentEntry;

          const handlerData = {
            blockId,
            blockSegment: "",
            ...block.fields,
            heading:
              block.fields.headingSection || block.fields.heading || item.title,
            body:
              block.fields.body180 ||
              block.fields.bodyRedactorRestricted ||
              block.fields.description ||
              "",
            variation: block.type,
          };

          // Handle nested assetGrid in Craft
          if (bType === "assetGrid" && block.fields.assetGrid) {
            handlerData.innerGrid = block.fields.assetGrid;
            const innerFIdx = rawFileContent.indexOf(`"assetGrid":`, fIdx);
            handlerData.innerSegment = rawFileContent.substring(
              innerFIdx,
              nextPIdx === -1 ? undefined : nextPIdx,
            );
          }

          // Pass full block for contentSummary (needs list.listing structure)
          if (bType === "contentSummary") {
            handlerData.list = block.fields.list;
          }

          if (config.handler === genericComponentHandler) {
            const cfId = await genericComponentHandler(
              env,
              handlerData,
              config.mapping,
              assetMap,
              summary,
            );
            if (cfId) componentEntry = await env.getEntry(cfId);
          } else {
            componentEntry = await config.handler(
              env,
              handlerData,
              assetMap,
              summary,
            );
          }

          if (componentEntry) {
            if (Array.isArray(componentEntry)) {
              contentComponents.push(
                ...componentEntry.map((e) => makeLink(e.sys.id)),
              );
            } else {
              contentComponents.push(makeLink(componentEntry.sys.id));
            }
          }
        } else if (bType !== "contentSummary" && bType !== "biographies") {
          console.warn(
            `   ⚠️ No component mapping for block type "${bType}" found in ${fieldName}`,
          );
          if (!summary.missingMappings.has(bType)) {
            summary.missingMappings.set(bType, Object.keys(block.fields || {}));
          }
        }
      }
    };

    await processMatrix("mainBannerPress");
    await processMatrix("detailsContentPress");
    await processMatrix("sideNavContentPress");

    // 5. Section Navigation
    let sectionNavigationLink = null;
    if (item.sectionNavigation && item.sectionNavigation.length > 0) {
      const navId = String(item.sectionNavigation[0]);
      try {
        const navEntries = await env.getEntries({
          content_type: "sectionNavigation",
          "fields.blockId": navId,
          limit: 1,
        });
        if (navEntries.items.length > 0) {
          sectionNavigationLink = makeLink(navEntries.items[0].sys.id);
        }
      } catch (err) {
        console.warn(
          `   ⚠️ Error looking up sectionNavigation ${navId}: ${err.message}`,
        );
      }
    }

    // 6. Build fields for main entry
    const cfFields = {
      entryId: { [LOCALE]: String(item.id) },
      title: { [LOCALE]: item.title },
      slug: { [LOCALE]: item.slug },
      entryType: { [LOCALE]: entryType },
      abstract: { [LOCALE]: item.abstract || "" },
      addFeaturedToListing: { [LOCALE]: !!item.switch },
    };

    // Post Date (Contentful Date: YYYY-MM-DD) – from postDate, dateCreated, or date
    const dateRaw = item.postDate || item.dateCreated || item.date;
    if (dateRaw) {
      const d = new Date(dateRaw);
      if (!isNaN(d.getTime())) {
        cfFields.postDate = {
          [LOCALE]: d.toISOString().slice(0, 10),
        };
      }
    }

    // Legacy Link (Symbol) – set if source has legacyUrl or legacyLink
    const legacyUrl =
      item.legacyLink ||
      (item.legacyUrl && typeof item.legacyUrl === "string" ? item.legacyUrl : null);
    if (legacyUrl) {
      cfFields.legacyLink = { [LOCALE]: unwrapUrl(legacyUrl) };
    }

    // Boilerplate (RichText) – for Entry Type "Boilerplate", map bodyRedactorRestricted
    if (entryType === "Boilerplate" && item.bodyRedactorRestricted) {
      try {
        cfFields.boilerplate = {
          [LOCALE]: await convertHtmlToRichText(env, item.bodyRedactorRestricted),
        };
      } catch (err) {
        console.warn(`   ⚠️ Boilerplate rich text conversion failed: ${err.message}`);
      }
    }

    if (mediaContactLink)
      cfFields.mediaContact = { [LOCALE]: mediaContactLink };
    if (mediaLogoLink) cfFields.mediaLogo = { [LOCALE]: mediaLogoLink };
    if (contentComponents.length > 0)
      cfFields.sections = { [LOCALE]: contentComponents };
    if (sectionNavigationLink)
      cfFields.sectionNavigation = { [LOCALE]: sectionNavigationLink };

    // 5.5 SEO
    const seoEntry = await getOrCreateSeo(env, item, assetMap);
    if (seoEntry) {
      cfFields.seo = { [LOCALE]: makeLink(seoEntry.sys.id) };
    }

    // 5.6 Coverage Link
    if (item.pressLink) {
      const link = parseCraftLink(item.pressLink);
      if (link.url) cfFields.coverageLink = { [LOCALE]: unwrapUrl(link.url) };
    }

    // 5.7 Taxonomy Concepts
    const metadata = { concepts: [], tags: [] };
    const conceptsSet = new Set();
    const conceptMapping = {
      "Use Cases": "useCases",
      "Manage passwords, secrets, & sessions": "managePasswordsSecretsSessions",
      "Enforce least privilege & JIT access": "enforceLeastPrivilegeJitAccess",
      "Improve identity security & posture": "improveIdentitySecurityPosture",
      "Meet compliance mandates": "meetComplianceMandates",
      "Secure all access: remote, OT, vendor, etc.":
        "secureAllAccessRemoteOtVendorEtc",
      "Support service desks, users, devices, & desktops":
        "supportServiceDesksUsersDevicesDesktops",
      "Content Type": "contentType",
      Videos: "videos",
      Products: "products",
      Industries: "industries",
      Manufacturing: "manufacturing",
      Healthcare: "healthcare",
      "Financial Services": "financialServices",
      Government: "government",
      "High Tech": "highTech",
      Education: "education",
      "Energy and Utilities": "energyAndUtilities",
      "Retail & Hospitality": "retailHospitality",
      Tags: "tags",
      Cybersecurity: "cybersecurity",
      "Products Slug": "productsSlug",
      People: "people",
    };

    if (item.generalCategories) {
      for (const catId of item.generalCategories) {
        const catName = getCategoryName(catId);
        const conceptId = conceptMapping[catName];
        if (conceptId) conceptsSet.add(conceptId);
      }
    }

    if (item.pressMediaCategories) {
      for (const catId of item.pressMediaCategories) {
        const cat = pressCategoriesData.find(
          (c) => String(c.id) === String(catId),
        );
        const catName = cat ? cat.title : null;
        const conceptId = conceptMapping[catName];
        if (conceptId) conceptsSet.add(conceptId);
      }
    }

    if (conceptsSet.size > 0) {
      metadata.concepts = Array.from(conceptsSet).map((id) => ({
        sys: { type: "Link", linkType: "TaxonomyConcept", id },
      }));
    }

    // 7. Upsert/Publish Press & Media Entry
    try {
      await upsertEntry(
        env,
        CONTENT_TYPE,
        entryId,
        cfFields,
        true,
        conceptsSet.size > 0 ? metadata : null,
      );
      summary.created++;
    } catch (err) {
      console.error(
        `   🛑 Error upserting Press entry ${item.id}:`,
        err.message,
      );
      summary.skipped.push({
        page: item.title,
        type: CONTENT_TYPE,
        error: err.message,
      });
    }
  }
}

/**
 * Specific handler for mainBannerPress content type
 */
export async function createOrUpdatePressBanner(
  env,
  bannerData,
  assetMap = null,
) {
  const CT = "mainBannerPress";
  if (!env) return { sys: { id: `banner-${bannerData.blockId}` } };

  const fields = {
    blockId: { [LOCALE]: String(bannerData.blockId) },
    blockName: { [LOCALE]: bannerData.heading || "Press Banner" },
    heading: { [LOCALE]: bannerData.heading || "" },
    description: { [LOCALE]: String(bannerData.body || "") },
    bannerOption: {
      [LOCALE]:
        bannerData.variation === "bannerSlim"
          ? "Banner Slim"
          : "Banner Media Right",
    },
    // "Stack heading and body?" – from Craft mainBannerPress block field "switch"
    stackHeadingAndBody: { [LOCALE]: !!bannerData.switch },
  };

  // Handle CTA if present
  if (bannerData.ctaLink) {
    const linkInfo = parseCraftLink(bannerData.ctaLink);
    const label = bannerData.label || linkInfo.label || "Learn More";
    const ctaEntry = await upsertCta(
      env,
      bannerData.blockId,
      label,
      linkInfo.url,
      true,
      linkInfo.linkedId,
    );
    if (ctaEntry) {
      fields.cta = { [LOCALE]: makeLink(ctaEntry.sys.id) };
    }
  }

  return await upsertEntry(env, CT, `banner-${bannerData.blockId}`, fields);
}

/**
 * Handler for contentSummary (Details Content - Press bullet list).
 * Craft: block.fields.list.<key>.fields.listing.<id> = { type: "listItem", fields: { item: "..." } }
 * Contentful: contentSummary has bulletPoint (Array of Link → listing, max 4). listing has item (Symbol).
 */
export async function createOrUpdateContentSummary(
  env,
  blockData,
  assetMap = null,
  summary = null,
) {
  const CT_SUMMARY = "contentSummary";
  const CT_LISTING = "listing";
  const blockId = String(blockData.blockId || "");
  if (!blockId || !env) return null;

  const listData = blockData.list;
  if (!listData || typeof listData !== "object") {
    console.warn(`   ⚠️ contentSummary ${blockId}: no list data`);
    return null;
  }

  const firstListKey = Object.keys(listData)[0];
  const listNode = firstListKey && listData[firstListKey];
  const listingObj =
    listNode?.fields?.listing && typeof listNode.fields.listing === "object"
      ? listNode.fields.listing
      : null;
  if (!listingObj) {
    console.warn(`   ⚠️ contentSummary ${blockId}: no listing items`);
    return null;
  }

  const listingIds = Object.keys(listingObj)
    .filter((k) => listingObj[k].enabled !== false)
    .sort((a, b) => Number(a) - Number(b));
  const itemTexts = listingIds
    .map((id) => listingObj[id].fields?.item)
    .filter((t) => t != null && String(t).trim() !== "");
  const maxItems = 4;
  const textsToMigrate = itemTexts.slice(0, maxItems);

  const bulletLinks = [];
  for (let i = 0; i < textsToMigrate.length; i++) {
    const listingEntryId = `listing-${blockId}-${i}`;
    const listingEntry = await upsertEntry(
      env,
      CT_LISTING,
      listingEntryId,
      { item: { [LOCALE]: String(textsToMigrate[i]).trim() } },
      true,
    );
    if (listingEntry?.sys?.id) {
      bulletLinks.push(makeLink(listingEntry.sys.id));
    }
  }

  if (bulletLinks.length === 0) {
    console.warn(`   ⚠️ contentSummary ${blockId}: no listing entries created`);
    return null;
  }

  const summaryEntryId = `contentSummary-${blockId}`;
  const summaryFields = {
    blockId: { [LOCALE]: blockId },
    blockName: { [LOCALE]: blockData.blockName || "Content Summary" },
    bulletPoint: { [LOCALE]: bulletLinks },
  };
  const entry = await upsertEntry(
    env,
    CT_SUMMARY,
    summaryEntryId,
    summaryFields,
    true,
  );
  return entry;
}

/**
 * Handler for assetGrid
 * Processes both top-level asset containers and nested asset arrays
 */
export async function createOrUpdateAssetGrid(
  env,
  gridData,
  assetMap,
  summary,
) {
  const CT = "assetGrid";
  if (!env) return { sys: { id: `grid-${gridData.blockId}` } };

  const results = [];

  // Check if we have an inner matrix of grids (common in sideNavContentPress)
  if (gridData.innerGrid) {
    const innerIds = getOrderedKeys(
      gridData.innerSegment || "",
      gridData.innerGrid,
    );
    for (const subId of innerIds) {
      const subData = gridData.innerGrid[subId];
      if (!subData.enabled) continue;

      const subResults = await createOrUpdateAssetGrid(
        env,
        {
          blockId: subId,
          ...subData.fields,
          heading: gridData.headingSection || gridData.heading,
        },
        assetMap,
        summary,
      );

      if (Array.isArray(subResults)) results.push(...subResults);
      else if (subResults) results.push(subResults);
    }
    return results;
  }

  const assets = Array.isArray(gridData.asset)
    ? gridData.asset
    : Array.isArray(gridData.assets)
      ? gridData.assets
      : [];
  // assetGrid.asset is Array of Link to "images" entries (Contentful schema)
  const assetLinks = [];
  for (let i = 0; i < assets.length; i++) {
    const craftAssetId = String(assets[i]);
    const assetInfo = assetMap.get(craftAssetId);
    if (assetInfo?.id) {
      const imageFields = {
        image: { [LOCALE]: makeLink(assetInfo.id, "Asset") },
        imageCaption: { [LOCALE]: "" },
      };
      const imagesEntry = await upsertEntry(
        env,
        "images",
        `images-${gridData.blockId}-${i}`,
        imageFields,
        true,
      );
      if (imagesEntry) assetLinks.push(makeLink(imagesEntry.sys.id));
    }
  }

  if (assetLinks.length === 0) return results;

  // One assetGrid entry per grid with asset = Array of Link to images
  const fields = {
    blockId: { [LOCALE]: String(gridData.blockId) },
    blockName: {
      [LOCALE]: gridData.heading || gridData.blockName || "Asset Grid",
    },
    asset: { [LOCALE]: assetLinks },
  };
  if (gridData.heading) {
    const titleEntry = await upsertSectionTitle(
      env,
      gridData.blockId,
      gridData.heading,
    );
    if (titleEntry?.sys?.id) {
      fields.sectionTitle = { [LOCALE]: makeLink(titleEntry.sys.id) };
    }
  }
  const entry = await upsertEntry(
    env,
    CT,
    `grid-${gridData.blockId}`,
    fields,
    true,
  );
  if (entry) results.push(entry);
  return results;
}

/**
 * Handler for biography (Press & Media)
 * Contentful: biography { blockId, blockName, sectionTitle?, biography (Array Link peopleCpt) }
 * Craft: person/people/biography as array of person IDs
 */
export async function createOrUpdateBiography(env, blockData, assetMap, summary) {
  const CT = "biography";
  if (!env) return { sys: { id: `biography-${blockData.blockId}` } };

  try {
    await env.getContentType(CT);
  } catch (err) {
    console.warn(`   ⚠ biography not found in Contentful: ${err.message}. Skipping.`);
    return null;
  }

  const blockId = blockData.blockId;
  const personIds = [
    ...(Array.isArray(blockData.biography) ? blockData.biography : []),
    ...(Array.isArray(blockData.people) ? blockData.people : []),
    ...(Array.isArray(blockData.person) ? blockData.person : []),
    ...(blockData.person != null && !Array.isArray(blockData.person) ? [blockData.person] : []),
  ];
  const peopleLinks = [];
  for (const id of personIds) {
    const personId = String(id);
    const ref = resolveEntryRef(personId);
    if (ref && ref.type === "peopleCpt" && ref.id) {
      peopleLinks.push(makeLink(ref.id));
    } else {
      try {
        const personEntries = await env.getEntries({
          content_type: "peopleCpt",
          "fields.entryId": personId,
          limit: 1,
        });
        if (personEntries.items.length > 0) {
          peopleLinks.push(makeLink(personEntries.items[0].sys.id));
        }
      } catch (_) {
        // skip
      }
    }
  }

  let sectionTitleLink = null;
  if (blockData.heading || blockData.headingSection) {
    const titleEntry = await upsertSectionTitle(
      env,
      blockId,
      blockData.heading || blockData.headingSection || "Biography",
    );
    if (titleEntry?.sys?.id) {
      sectionTitleLink = makeLink(titleEntry.sys.id);
    }
  }

  const fields = {
    blockId: { [LOCALE]: String(blockId) },
    blockName: { [LOCALE]: blockData.blockName || blockData.heading || "Biography" },
    biography: { [LOCALE]: peopleLinks },
  };
  if (sectionTitleLink) {
    fields.sectionTitle = { [LOCALE]: sectionTitleLink };
  }

  return await upsertEntry(env, CT, `biography-${blockId}`, fields, true);
}
