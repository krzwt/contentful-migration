import { upsertCta, upsertSectionTitle } from "../utils/contentfulHelpers.js";
import { mapBackgroundColor } from "../utils/colorMap.js";

const LOCALE = "en-US";
const CONTENT_TYPE = "ctaBlock";

/* -----------------------------
   MAIN UPSERT
 ------------------------------ */
export async function createOrUpdateCtaBlock(env, blockData, assetMap = null) {
    // 1. Verify Content Type exists
    try {
        await env.getContentType(CONTENT_TYPE);
    } catch (err) {
        console.warn(`   ⚠ Component "${CONTENT_TYPE}" not founded in contentful or error: ${err.message}. Skipping block ${blockData.blockId}.`);
        return null;
    }

    let existing;
    try {
        existing = await env.getEntries({
            content_type: CONTENT_TYPE,
            "fields.blockId": blockData.blockId,
            limit: 1
        });
    } catch (err) {
        console.error(`   🛑 Error fetching existing entries for "${CONTENT_TYPE}":`, err.message);
        return null;
    }

    /* -----------------------------
       NESTED ENTRIES
    ------------------------------ */

    // 1. Section Title
    let titleEntry = null;
    if (blockData.headingSection) {
        titleEntry = await upsertSectionTitle(env, blockData.blockId, blockData.headingSection);
    }

    // 2. CTA
    let ctaEntry = null;
    const label = blockData.label || blockData.ctaText || "";
    const url = (() => {
        const rawLink = blockData.ctaLink;
        if (!rawLink) return "";
        if (typeof rawLink === "string" && rawLink.startsWith("{")) {
            try {
                const parsed = JSON.parse(rawLink);
                return parsed.linkedUrl || parsed.url || "";
            } catch (e) {
                return rawLink;
            }
        }
        return String(rawLink);
    })();

    if (label || url) {
        ctaEntry = await upsertCta(env, blockData.blockId, label, url);
    }

    /* -----------------------------
       CTA BLOCK FIELDS
    ------------------------------ */
    const fields = {
        blockId: { [LOCALE]: blockData.blockId },
        blockName: { [LOCALE]: blockData.blockName || blockData.headingSection || "CTA Block" },
        selectBackgroundColor: { [LOCALE]: mapBackgroundColor(blockData.backgroundColor) }
    };

    if (titleEntry) {
        fields.sectionTitle = {
            [LOCALE]: {
                sys: { type: "Link", linkType: "Entry", id: titleEntry.sys.id }
            }
        };
    }

    if (ctaEntry) {
        fields.cta = {
            [LOCALE]: {
                sys: { type: "Link", linkType: "Entry", id: ctaEntry.sys.id }
            }
        };
    }

    let entry;
    if (existing.items.length) {
        entry = existing.items[0];
        console.log("🔄 Updating existing ctaBlock:", entry.sys.id);
        entry.fields = fields;
        entry = await entry.update();
        entry = await entry.publish();
    } else {
        console.log("✨ Creating new ctaBlock");
        entry = await env.createEntry(CONTENT_TYPE, { fields });
        entry = await entry.publish();
    }

    return entry;
}
