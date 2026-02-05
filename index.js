import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import mime from "mime-types";
import {
  JSDOM
} from "jsdom";
import {
  getEnvironment
} from "./config/contentful.js";

/* -----------------------------
   CONFIG
------------------------------ */
const PAGE_CONTENT_TYPE = "pageLanding";
const HERO_CONTENT_TYPE = "homeHero";
const LOCALE = "en-US";
const JSON_FILE = "./data/test1.json";

/* -----------------------------
   HELPERS
------------------------------ */
function isValidHttpUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeSrc(src) {
  if (!src) return null;
  return src.replace(/^\\?"|\\?"$/g, "").trim();
}

/* -----------------------------
   IMAGE → CONTENTFUL ASSET
------------------------------ */
async function uploadImageFromUrl(env, imageUrl) {
  try {
    // 1️⃣ Check existing asset first
    const existingAssetId = await findExistingAssetByUrl(env, imageUrl);
    if (existingAssetId) {
      console.log("♻️ Reusing existing asset");
      return existingAssetId;
    }

    // 2️⃣ Download image
    const response = await fetch(imageUrl);
    if (!response.ok) {
      console.warn("⚠️ Failed to fetch image:", imageUrl);
      return null;
    }

    const buffer = await response.arrayBuffer();
    const contentType =
      response.headers.get("content-type") ||
      mime.lookup(imageUrl) ||
      "image/jpeg";

    const fileName = path.basename(new URL(imageUrl).pathname);

    // 3️⃣ Upload binary
    const upload = await env.createUpload({
      file: Buffer.from(buffer)
    });

    // 4️⃣ Create asset
    const asset = await env.createAsset({
      fields: {
        title: {
          [LOCALE]: fileName
        },
        description: {
          [LOCALE]: imageUrl
        }, // ⭐ store original URL
        file: {
          [LOCALE]: {
            contentType,
            fileName,
            uploadFrom: {
              sys: {
                type: "Link",
                linkType: "Upload",
                id: upload.sys.id
              }
            }
          }
        }
      }
    });

    const processed = await asset.processForAllLocales();
    await processed.publish();

    console.log(`🖼 Asset uploaded: ${fileName}`);
    return processed.sys.id;

  } catch (err) {
    console.warn("⚠️ Image upload skipped:", imageUrl);
    return null;
  }
}

/* -----------------------------
   HTML / TEXT → RICH TEXT
------------------------------ */
async function convertHtmlToRichText(env, html) {
  const source = String(html || "").trim();

  if (!source) {
    return {
      nodeType: "document",
      data: {},
      content: []
    };
  }

  const dom = new JSDOM(`<body>${source}</body>`);
  const document = dom.window.document;
  const content = [];

  for (const node of document.body.childNodes) {

    /* IMAGE */
    if (node.nodeName === "IMG") {
      const src = normalizeSrc(node.getAttribute("src"));
      if (!src || !isValidHttpUrl(src)) continue;

      const assetId = await uploadImageFromUrl(env, src);
      if (assetId) {
        content.push({
          nodeType: "embedded-asset-block",
          data: {
            target: {
              sys: {
                type: "Link",
                linkType: "Asset",
                id: assetId
              }
            }
          },
          content: [] // ✅ FIX
        });
      }
    }


    /* HEADINGS */
    if (/^H[1-6]$/.test(node.nodeName)) {
      const level = node.nodeName.replace("H", "");
      content.push({
        nodeType: `heading-${level}`,
        data: {},
        content: parseInlineNodes(node)
      });
    }



    /* PARAGRAPH */
    if (node.nodeName === "P") {
      const inline = parseInlineNodes(node);
      if (inline.length) {
        content.push({
          nodeType: "paragraph",
          data: {},
          content: inline
        });
      }
    }

    /* UNORDERED / ORDERED LIST */
    if (node.nodeName === "UL" || node.nodeName === "OL") {
      content.push({
        nodeType: node.nodeName === "UL" ? "unordered-list" : "ordered-list",
        data: {},
        content: buildListItems(node)
      });
    }
  }

  return {
    nodeType: "document",
    data: {},
    content
  };
}

function buildListItems(listNode) {
  const items = [];

  listNode.querySelectorAll("li").forEach(li => {
    const inline = parseInlineNodes(li);
    if (!inline.length) return;

    items.push({
      nodeType: "list-item",
      data: {},
      content: [{
        nodeType: "paragraph",
        data: {},
        content: inline
      }]
    });
  });

  return items;
}


/* -----------------------------
   CREATE / UPDATE HERO
------------------------------ */
async function createOrUpdateHomeHero(env, banner) {
  if (!banner) return null;

  const blockId = String(banner.id || "").trim();
  const title = (banner.headingSection || "").trim();
  const desc = banner.descSection || "";

  if (!blockId || !title) return null;

  const richText = await convertHtmlToRichText(env, desc);

  const existing = await env.getEntries({
    content_type: HERO_CONTENT_TYPE,
    "fields.blockId": blockId,
    limit: 1
  });

  if (existing.items.length > 0) {
    const hero = existing.items[0];

    hero.fields.heroTitle = {
      [LOCALE]: title
    };
    hero.fields.heroDescription = {
      [LOCALE]: richText
    };

    const updated = await hero.update();
    await updated.publish();

    console.log("🔄 HomeHero updated");
    return hero.sys.id;
  }

  const hero = await env.createEntry(HERO_CONTENT_TYPE, {
    fields: {
      blockId: {
        [LOCALE]: blockId
      },
      heroTitle: {
        [LOCALE]: title
      },
      heroDescription: {
        [LOCALE]: richText
      }
    }
  });

  await hero.publish();
  console.log("✔ HomeHero created");
  return hero.sys.id;
}


/* -----------------------------
   MAIN IMPORT
------------------------------ */
async function runImport() {
  const env = await getEnvironment();
  const raw = JSON.parse(fs.readFileSync(JSON_FILE, "utf8"));
  const entries = raw?.data?.entries || [];

  for (const item of entries) {
    const craftId = String(item.id || "").trim();
    const title = item.title?.trim();
    const slug = item.slug?.trim();

    if (!craftId || !title || !slug) continue;

    const existingPage = await env.getEntries({
      content_type: PAGE_CONTENT_TYPE,
      "fields.craftId": craftId,
      limit: 1
    });

    if (existingPage.items.length > 0) {
      console.log(`🔄 Page exists, syncing hero: ${title}`);
      await createOrUpdateHomeHero(env, item.mainBannerStandalone?. [0]);
      continue;
    }

    const heroId = await createOrUpdateHomeHero(env, item.mainBannerStandalone?. [0]);

    const page = await env.createEntry(PAGE_CONTENT_TYPE, {
      fields: {
        craftId: {
          [LOCALE]: craftId
        },
        title: {
          [LOCALE]: title
        },
        slug: {
          [LOCALE]: slug
        },
        pageComponenents: {
          [LOCALE]: heroId ? [{
            sys: {
              type: "Link",
              linkType: "Entry",
              id: heroId
            }
          }] : []
        }
      }
    });

    await page.publish();
    console.log(`✔ Page created: ${title}`);
  }

  console.log("🎉 Import complete");
}

runImport();

function parseInlineNodes(node) {
  const nodes = [];

  node.childNodes.forEach(child => {
    // TEXT NODE
    if (child.nodeType === 3) {
      if (child.textContent.trim()) {
        nodes.push({
          nodeType: "text",
          value: child.textContent,
          marks: [],
          data: {}
        });
      }
    }

    // STRONG / B
    if (child.nodeName === "STRONG" || child.nodeName === "B") {
      nodes.push({
        nodeType: "text",
        value: child.textContent,
        marks: [{
          type: "bold"
        }],
        data: {}
      });
    }

    // EM / I
    if (child.nodeName === "EM" || child.nodeName === "I") {
      nodes.push({
        nodeType: "text",
        value: child.textContent,
        marks: [{
          type: "italic"
        }],
        data: {}
      });
    }

    // UNDERLINE
    if (child.nodeName === "U") {
      nodes.push({
        nodeType: "text",
        value: child.textContent,
        marks: [{
          type: "underline"
        }],
        data: {}
      });
    }

    // LINK
    if (child.nodeName === "A") {
      const href = child.getAttribute("href");
      if (href) {
        nodes.push({
          nodeType: "hyperlink",
          data: {
            uri: href
          },
          content: [{
            nodeType: "text",
            value: child.textContent,
            marks: [],
            data: {}
          }]
        });
      }
    }
  });

  return nodes;
}
async function findExistingAssetByUrl(env, imageUrl) {
  const assets = await env.getAssets({
    'fields.description[match]': imageUrl,
    limit: 1
  });

  return assets.items.length ? assets.items[0].sys.id : null;
}