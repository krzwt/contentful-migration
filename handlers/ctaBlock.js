const LOCALE = "en-US";
const CONTENT_TYPE = "ctaBlock";

/* -----------------------------
   MAIN UPSERT
 ------------------------------ */
export async function createOrUpdateCtaBlock(env, blockData, assetMap = null) {
    // 1. Verify Content Type exists
    let contentType;
    try {
        contentType = await env.getContentType(CONTENT_TYPE);
    } catch (err) {
        console.warn(`   ⚠ Component "${CONTENT_TYPE}" not founded in contentful. Skipping block ${blockData.blockId}.`);
        return null;
    }

    // 2. Verify Fields exist
    const expectedFields = ["blockId", "selectBackgroundColor", "sectionTitle", "ctaText", "ctaLink"];
    const ctFields = contentType.fields.map(f => f.id);
    const missingFields = expectedFields.filter(f => !ctFields.includes(f));

    if (missingFields.length > 0) {
        console.warn(`   ⚠ Field(s) not founded in contentful for "${CONTENT_TYPE}": ${missingFields.join(", ")}`);
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

    const fields = {
        blockId: { [LOCALE]: blockData.blockId },
        selectBackgroundColor: { [LOCALE]: blockData.backgroundColor || "darkBlue" },
        sectionTitle: { [LOCALE]: blockData.headingSection || "" },
        ctaText: { [LOCALE]: blockData.label || blockData.ctaText || "" },
        ctaLink: {
            [LOCALE]: (() => {
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
            })()
        }
    };

    let entry;
    if (existing.items.length) {
        entry = existing.items[0];
        console.log("🔄 Updating existing ctaBlock:", entry.sys.id);
        entry.fields = { ...entry.fields, ...fields };
        entry = await entry.update();
        entry = await entry.publish();
    } else {
        console.log("✨ Creating new ctaBlock");
        entry = await env.createEntry(CONTENT_TYPE, { fields });
        entry = await entry.publish();
    }

    return entry;
}
