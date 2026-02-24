import fs from "fs";

let tagMapping = new Map();

/**
 * Loads a mapping of Craft Tag ID -> Tag Name
 * Expected format: { "12345": "Tag Name", ... }
 */
export function loadTagMapping(filePath = "./data/tags.json") {
    if (!fs.existsSync(filePath)) {
        console.warn(`⚠️ Tag mapping file not found: ${filePath}`);
        return;
    }
    try {
        const raw = fs.readFileSync(filePath, "utf-8");
        const data = JSON.parse(raw);

        // Handle Craft GraphQL format { data: { tags: [...] } }
        const tags = data.data?.tags || data.tags || (Array.isArray(data) ? data : []);

        if (Array.isArray(tags)) {
            tags.forEach(t => {
                if (t.id && t.title) {
                    tagMapping.set(String(t.id), t.title);
                }
            });
        } else {
            // Handle flat object { "id": "name" }
            for (const [id, name] of Object.entries(data)) {
                if (typeof name === 'string') {
                    tagMapping.set(String(id), name);
                }
            }
        }

        console.log(`✅ Loaded ${tagMapping.size} tag definitions.`);
    } catch (err) {
        console.error(`❌ Error loading tags: ${err.message}`);
    }
}

/**
 * Ensures tags exist in Contentful and returns link objects for entry metadata.
 */
export async function processTags(env, craftTagIds) {
    if (!craftTagIds || !craftTagIds.length || !env) return [];

    const contentfulTags = [];

    // 1. Get existing tags in Contentful to avoid duplicates
    let existingTags;
    try {
        existingTags = await env.getTags();
    } catch (e) {
        console.warn("⚠️ Could not fetch existing tags, proceeding anyway.");
        existingTags = { items: [] };
    }

    for (const id of craftTagIds) {
        const tagName = tagMapping.get(String(id));
        if (!tagName) {
            console.warn(`   ⚠️ No name found for Tag ID ${id}, skipping.`);
            continue;
        }
        console.log(`   🏷️  Processing Tag: "${tagName}" (${id})`);

        // Generate a valid Tag ID (slugified)
        const tagId = tagName.toLowerCase()
            .replace(/[^a-z0-9]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');

        // 2. Check if tag already exists
        let tag = existingTags.items.find(t => t.sys.id === tagId);

        if (!tag) {
            try {
                // Check if it exists beyond the first 100 tags
                tag = await env.getTag(tagId);
            } catch (err) {
                tag = null;
            }
        }

        if (!tag) {
            console.log(`   ✨ Creating new Environment Tag: "${tagName}" (${tagId})`);
            try {
                tag = await env.createTag(tagId, tagName);
            } catch (err) {
                const isConflict = String(err.status) === "409" || String(err.message || "").includes("409") || String(err.message || "").includes("already exists");
                if (isConflict) {
                    // Fallback: fetch it if creation failed due to race condition or pagination gap
                    tag = await env.getTag(tagId);
                } else {
                    console.error(`   🛑 Failed to create tag ${tagId}:`, err.message || "409 Conflict");
                    continue;
                }
            }
        } else if (tag.name !== tagName) {
            console.log(`   🔄 Updating Tag Name: "${tag.name}" -> "${tagName}"`);
            tag.name = tagName;
            try {
                tag = await tag.update();
            } catch (err) {
                console.error(`   🛑 Failed to update tag ${tagId}:`, err.message);
            }
        }

        contentfulTags.push({
            sys: {
                type: "Link",
                linkType: "Tag",
                id: tagId
            }
        });
    }

    return contentfulTags;
}
