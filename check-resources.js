import { getEnvironment } from "./config/contentful.js";
import { prePopulateEntryIdCache, resolveEntryRef } from "./utils/contentfulHelpers.js";
import "dotenv/config";

(async () => {
    const env = await getEnvironment();
    await prePopulateEntryIdCache(env);
    
    const ids = ["2447373", "2371029", "2310558", "2369354"];
    ids.forEach(id => {
        console.log(`ID ${id}:`, resolveEntryRef(id));
    });
    
    process.exit(0);
})();
