import { JSDOM } from "jsdom";
import { uploadImageFromUrl } from "./assets.js";
import { normalizeSrc, isValidHttpUrl } from "./normalize.js";

/**
 * Cleans Craft CMS reference tags from URLs in HTML source.
 * e.g. {entry:123@1:url||https://example.com} -> https://example.com
 * e.g. https://example.com#entry:123@1:url -> https://example.com
 */
export function cleanCraftUrls(html) {
  if (!html) return "";
  let cleaned = html;

  // 1. Resolve {entry:ID@SITE:url||FALLBACK} to FALLBACK
  cleaned = cleaned.replace(/\{entry:[^|]+\|\|(.*?)\}/g, "$1");

  // 2. Remove #entry:ID@SITE:url fragments
  cleaned = cleaned.replace(/#entry:\d+@\d+:url/g, "");

  return cleaned;
}

export function parseInlineNodes(node, activeMarks = []) {
  let nodes = [];

  node.childNodes.forEach(child => {
    if (child.nodeType === 3) { // Text node
      const text = child.textContent;
      if (text) {
        const mdLinkRegex = /\[([^\]]+)\]\(\s*([^\)]+)\s*\)/g;
        let lastIndex = 0;
        let match;

        while ((match = mdLinkRegex.exec(text)) !== null) {
          if (match.index > lastIndex) {
            nodes.push({
              nodeType: "text",
              value: text.substring(lastIndex, match.index),
              marks: [...activeMarks],
              data: {}
            });
          }

          nodes.push({
            nodeType: "hyperlink",
            data: { uri: match[2].trim() },
            content: [{
              nodeType: "text",
              value: match[1],
              marks: [...activeMarks],
              data: {}
            }]
          });

          lastIndex = mdLinkRegex.lastIndex;
        }

        if (lastIndex < text.length) {
          const remainingText = text.substring(lastIndex);
          if (remainingText.length > 0) {
            nodes.push({
              nodeType: "text",
              value: remainingText,
              marks: [...activeMarks],
              data: {}
            });
          }
        }
      }
    } else if (child.nodeType === 1) { // Element node
      const newMarks = [...activeMarks];
      let handled = false;
      const nodeName = child.nodeName.toUpperCase();

      if (["STRONG", "B"].includes(nodeName)) {
        newMarks.push({ type: "bold" });
      } else if (["EM", "I"].includes(nodeName)) {
        newMarks.push({ type: "italic" });
      } else if (nodeName === "U" || nodeName === "INS") {
        newMarks.push({ type: "underline" });
      } else if (nodeName === "A") {
        const href = child.getAttribute("href");
        nodes.push({
          nodeType: "hyperlink",
          data: { uri: href || "" },
          content: parseInlineNodes(child, activeMarks)
        });
        handled = true;
      } else if (nodeName === "BR") {
        nodes.push({
          nodeType: "text",
          value: "\n",
          marks: [...activeMarks],
          data: {}
        });
        handled = true;
      }

      if (!handled) {
        const childNodes = parseInlineNodes(child, newMarks);
        nodes = nodes.concat(childNodes);
      }
    }
  });

  return nodes;
}

function buildListItems(listNode) {
  return [...listNode.querySelectorAll("li")]
    .map(li => {
      const inline = parseInlineNodes(li);
      if (!inline.length) return null;

      return {
        nodeType: "list-item",
        data: {},
        content: [{
          nodeType: "paragraph",
          data: {},
          content: inline
        }]
      };
    })
    .filter(Boolean);
}

async function buildTableNodes(env, tableNode) {
  const rows = [];
  const thead = tableNode.querySelector("thead");
  if (thead) {
    const theadRows = thead.querySelectorAll("tr");
    for (const tr of theadRows) {
      const cells = [];
      for (const cell of tr.querySelectorAll("td, th")) {
        const cellRichText = await convertHtmlToRichText(env, cell.innerHTML);
        cells.push({
          nodeType: cell.nodeName === "TH" ? "table-header-cell" : "table-cell",
          data: {},
          content: cellRichText.content || []
        });
      }
      if (cells.length > 0) {
        rows.push({
          nodeType: "table-row",
          data: {},
          content: cells
        });
      }
    }
  }

  const tbody = tableNode.querySelector("tbody") || tableNode;
  const tbodyRows = tbody.querySelectorAll("tr");
  for (const tr of tbodyRows) {
    if (thead && thead.contains(tr)) continue;
    const cells = [];
    for (const cell of tr.querySelectorAll("td, th")) {
      const cellRichText = await convertHtmlToRichText(env, cell.innerHTML);
      cells.push({
        nodeType: cell.nodeName === "TH" ? "table-header-cell" : "table-cell",
        data: {},
        content: cellRichText.content || []
      });
    }
    if (cells.length > 0) {
      rows.push({
        nodeType: "table-row",
        data: {},
        content: cells
      });
    }
  }

  return rows;
}

export async function convertHtmlToRichText(env, html) {
  let source = String(html || "").trim();
  source = cleanCraftUrls(source);
  const dom = new JSDOM(`<body>${source}</body>`);
  const content = [];
  let inlineBuffer = [];

  const flushBuffer = () => {
    if (inlineBuffer.length > 0) {
      content.push({
        nodeType: "paragraph",
        data: {},
        content: [...inlineBuffer]
      });
      inlineBuffer = [];
    }
  };

  const isBlock = (node) => {
    if (node.nodeType !== 1) return false;
    const blockTags = ["P", "H1", "H2", "H3", "H4", "H5", "H6", "UL", "OL", "TABLE", "BLOCKQUOTE", "HR", "IMG"];
    return blockTags.includes(node.nodeName.toUpperCase());
  };

  for (const node of dom.window.document.body.childNodes) {
    if (isBlock(node)) {
      flushBuffer();
      const nodeName = node.nodeName.toUpperCase();

      if (/^H[1-6]$/.test(nodeName)) {
        let level = nodeName.replace("H", "");
        if (level === "1") level = "2";
        content.push({
          nodeType: `heading-${level}`,
          data: {},
          content: parseInlineNodes(node)
        });
      } else if (nodeName === "P") {
        const inline = parseInlineNodes(node);
        content.push({
          nodeType: "paragraph",
          data: {},
          content: inline
        });
      } else if (["UL", "OL"].includes(nodeName)) {
        content.push({
          nodeType: nodeName === "UL" ? "unordered-list" : "ordered-list",
          data: {},
          content: buildListItems(node)
        });
      } else if (nodeName === "TABLE") {
        content.push({
          nodeType: "table",
          data: {},
          content: await buildTableNodes(env, node)
        });
      } else if (nodeName === "IMG") {
        const src = normalizeSrc(node.getAttribute("src"));
        if (src && isValidHttpUrl(src)) {
          const assetId = await uploadImageFromUrl(env, src);
          if (assetId) {
            content.push({
              nodeType: "embedded-asset-block",
              data: { target: { sys: { type: "Link", linkType: "Asset", id: assetId } } },
              content: []
            });
          }
        }
      }
    } else {
      const temp = dom.window.document.createElement("div");
      temp.appendChild(node.cloneNode(true));
      const nodes = parseInlineNodes(temp);
      inlineBuffer = inlineBuffer.concat(nodes);
    }
  }
  flushBuffer();

  if (content.length === 0) {
    content.push({
      nodeType: "paragraph",
      data: {},
      content: [{ nodeType: "text", value: "", marks: [], data: {} }]
    });
  }

  content.forEach(node => {
    if (["paragraph", "heading-1", "heading-2", "heading-3", "heading-4", "heading-5", "heading-6"].includes(node.nodeType)) {
      if (!node.content || node.content.length === 0) {
        node.content = [{ nodeType: "text", value: "", marks: [], data: {} }];
      }
    }
  });

  return { nodeType: "document", data: {}, content };
}
