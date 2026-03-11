import { getEnvironment } from "./config/contentful.js";
import "dotenv/config";

(async () => {
    const env = await getEnvironment();
    try {
        const entry = await env.getEntry("title-2446047");
        console.log("TITLE OF title-2446047:", entry.fields.title["en-US"]);
        
        const tabs = await env.getEntry("restabs-2446047");
        console.log("BLOG TAB ITEMS:", tabs.fields.blogTab?.["en-US"]?.length || 0);
    } catch (e) {
        console.error("ERROR:", e.message);
    }
    process.exit(0);
})();
