/**
 * Handler: table → tableContentBlock
 * Craft: headingSection, bodyRedactorRestricted, table (columns + rows), textList
 * Contentful: tableContentBlock { blockId, blockName, sectionTitle, tableContent (RichText) }
 *
 * We convert the Craft table data into an HTML table, then to Rich Text.
 */
import { upsertEntry, upsertSectionTitle, makeLink } from "../utils/contentfulHelpers.js";
import { convertHtmlToRichText } from "../utils/richText.js";

const LOCALE = "en-US";
const CONTENT_TYPE = "tableContentBlock";

export async function createOrUpdateTable(env, blockData, assetMap = null) {
    try { await env.getContentType(CONTENT_TYPE); } catch (err) {
        console.warn(`   ⚠ Content type "${CONTENT_TYPE}" not found: ${err.message}. Skipping.`);
        return null;
    }

    const blockId = blockData.blockId;
    const heading = blockData.headingSection || "";

    const titleEntry = await upsertSectionTitle(env, blockId, heading);

    // Convert Craft table to HTML
    let tableHtml = "";
    const tableData = blockData.table;
    if (tableData && tableData.columns && tableData.rows) {
        const cols = tableData.columns;
        tableHtml = "<table>";
        // Header row
        tableHtml += "<tr>";
        for (const col of cols) {
            tableHtml += `<th>${col.heading || ""}</th>`;
        }
        tableHtml += "</tr>";
        // Data rows
        for (const row of tableData.rows) {
            tableHtml += "<tr>";
            for (const cell of row) {
                tableHtml += `<td>${cell || ""}</td>`;
            }
            tableHtml += "</tr>";
        }
        tableHtml += "</table>";
    }

    // Combine body + table
    const bodyHtml = blockData.bodyRedactorRestricted || "";
    const combinedHtml = bodyHtml + tableHtml;

    const fields = {
        blockId: { [LOCALE]: blockId },
        blockName: { [LOCALE]: blockData.blockName || heading || "Table" },
        tableContent: { [LOCALE]: await convertHtmlToRichText(env, combinedHtml || "<p></p>") }
    };
    if (titleEntry) fields.sectionTitle = { [LOCALE]: makeLink(titleEntry.sys.id) };

    return await upsertEntry(env, CONTENT_TYPE, `table-${blockId}`, fields);
}
