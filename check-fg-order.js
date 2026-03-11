import { getEnvironment } from "./config/contentful.js";
import "dotenv/config";

(async () => {
    const env = await getEnvironment();
    try {
        const entry = await env.getEntry("featuregrid-1811148");
        const items = entry.fields.addItem["en-US"];
        console.log("FEATURE GRID ITEMS ORDER:");
        for (let i = 0; i < items.length; i++) {
            const item = await env.getEntry(items[i].sys.id);
            console.log(`${i+1}. ${item.fields.cardName["en-US"]}`);
        }
    } catch (e) {
        console.error("ERROR:", e.message);
    }
    process.exit(0);
})();
