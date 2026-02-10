import { JSDOM } from "jsdom";
import { uploadImageFromUrl } from "./assets.js";
import { normalizeSrc, isValidHttpUrl } from "./normalize.js";

export function parseInlineNodes(node) {
  const nodes = [];

  node.childNodes.forEach(child => {
    if (child.nodeType === 3 && child.textContent.trim()) {
      nodes.push({
        nodeType: "text",
        value: child.textContent,
        marks: [],
        data: {}
      });
    }

    if (["STRONG", "B"].includes(child.nodeName)) {
      nodes.push({
        nodeType: "text",
        value: child.textContent,
        marks: [{ type: "bold" }],
        data: {}
      });
    }

    if (["EM", "I"].includes(child.nodeName)) {
      nodes.push({
        nodeType: "text",
        value: child.textContent,
        marks: [{ type: "italic" }],
        data: {}
      });
    }

    if (child.nodeName === "U") {
      nodes.push({
        nodeType: "text",
        value: child.textContent,
        marks: [{ type: "underline" }],
        data: {}
      });
    }

    if (child.nodeName === "A") {
      const href = child.getAttribute("href");
      if (href) {
        nodes.push({
          nodeType: "hyperlink",
          data: { uri: href },
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

export async function convertHtmlToRichText(env, html) {
  const source = String(html || "").trim();
  if (!source) return { nodeType: "document", data: {}, content: [] };

  const dom = new JSDOM(`<body>${source}</body>`);
  const content = [];

  for (const node of dom.window.document.body.childNodes) {

    // Handle plain text nodes at root level
    if (node.nodeType === 3 && node.textContent.trim()) {
      content.push({
        nodeType: "paragraph",
        data: {},
        content: [{
          nodeType: "text",
          value: node.textContent,
          marks: [],
          data: {}
        }]
      });
    }

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
          content: []
        });
      }
    }

    if (/^H[1-6]$/.test(node.nodeName)) {
      const level = node.nodeName.replace("H", "");
      content.push({
        nodeType: `heading-${level}`,
        data: {},
        content: parseInlineNodes(node)
      });
    }

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

    if (["UL", "OL"].includes(node.nodeName)) {
      content.push({
        nodeType: node.nodeName === "UL" ? "unordered-list" : "ordered-list",
        data: {},
        content: buildListItems(node)
      });
    }
  }

  return { nodeType: "document", data: {}, content };
}
