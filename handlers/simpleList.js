/**
 * Handler: simpleList → simpleList (Contentful)
 * Craft: listType, listHeading, listItems (object of { itemText } per id)
 * Contentful: simpleList { blockId, blockName, listType, listHeading, listItems: [simpleListItems] }
 * Nested: simpleListItems { itemText } (Contentful CT "simpleListItems")
 */
import { upsertEntry, makeLink } from "../utils/contentfulHelpers.js";
import { getOrderedKeys } from "../utils/jsonOrder.js";

const LOCALE = "en-US";
const SIMPLE_LIST_CT = "simpleList";
const SIMPLE_LIST_ITEMS_CT = "simpleListItems";

export async function createOrUpdateSimpleList(env, blockData, assetMap = null) {
  if (!env) {
    return { sys: { id: `dry-run-simpleList-${blockData.blockId}` } };
  }

  try {
    await env.getContentType(SIMPLE_LIST_CT);
    await env.getContentType(SIMPLE_LIST_ITEMS_CT);
  } catch (err) {
    console.warn(
      `   ⚠ simpleList or simpleListItems not found in Contentful: ${err.message}. Skipping.`
    );
    return null;
  }

  const blockId = blockData.blockId;
  const listItemsObj = blockData.listItems || {};
  const listItemIds = getOrderedKeys(
    blockData.blockSegment || "",
    listItemsObj
  );

  const itemLinks = [];
  for (let i = 0; i < listItemIds.length; i++) {
    const itemId = listItemIds[i];
    const item = listItemsObj[itemId];
    if (!item || !item.fields) continue;

    const itemText =
      item.fields.itemText != null ? String(item.fields.itemText) : "";

    const entryId = `sli-${blockId}-${itemId}`;
    const itemEntry = await upsertEntry(
      env,
      SIMPLE_LIST_ITEMS_CT,
      entryId,
      {
        itemText: { [LOCALE]: itemText },
      },
      true
    );
    if (itemEntry?.sys?.id) {
      itemLinks.push(makeLink(itemEntry.sys.id));
    }
  }

  // Normalize listType: Craft may send "unordered" | "ordered" → Contentful "Unordered" | "Ordered"
  let listType = blockData.listType || "Unordered";
  if (typeof listType === "string") {
    const lower = listType.toLowerCase();
    listType =
      lower === "ordered" ? "Ordered" : lower === "unordered" ? "Unordered" : listType;
  }

  const fields = {
    blockId: { [LOCALE]: String(blockId) },
    blockName: { [LOCALE]: blockData.blockName || blockData.listHeading || "Simple List" },
    listType: { [LOCALE]: listType },
    listHeading: { [LOCALE]: blockData.listHeading || "" },
    listItems: { [LOCALE]: itemLinks },
  };

  return await upsertEntry(
    env,
    SIMPLE_LIST_CT,
    `simplelist-${blockId}`,
    fields,
    true
  );
}
