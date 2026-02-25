import fs from "fs";

let categoryMap = new Map();
let categoryGroups = new Map();

/**
 * Load categories from general-categories.json
 */
export function loadCategories(filePath = "./data/general-categories.json") {
    if (!fs.existsSync(filePath)) {
        console.warn(`⚠️ Categories file not found: ${filePath}`);
        return;
    }

    try {
        const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
        data.forEach(cat => {
            categoryMap.set(String(cat.id), {
                id: cat.id,
                title: cat.title,
                slug: cat.slug,
                parentId: cat.parentId,
                uid: cat.uid
            });
        });

        // Group children by parent
        data.forEach(cat => {
            if (cat.parentId) {
                const parentId = String(cat.parentId);
                if (!categoryGroups.has(parentId)) {
                    categoryGroups.set(parentId, []);
                }
                categoryGroups.get(parentId).push(cat.id);
            }
        });

        console.log(`✅ Loaded ${categoryMap.size} categories from ${filePath}`);
    } catch (err) {
        console.error(`❌ Error loading categories: ${err.message}`);
    }
}

/**
 * Get category by ID
 */
export function getCategory(id) {
    return categoryMap.get(String(id));
}

/**
 * Get category name by ID
 */
export function getCategoryName(id) {
    return categoryMap.get(String(id))?.title || null;
}

/**
 * Get categories for a resource
 */
export function getCategoriesForResource(catIds) {
    if (!catIds || !Array.isArray(catIds)) return [];
    return catIds.map(id => getCategory(id)).filter(Boolean);
}
