import { getEnvironment } from "./config/contentful.js";
import { prePopulateEntryIdCache, resolveEntryRef } from "./utils/contentfulHelpers.js";
import "dotenv/config";

(async () => {
    const env = await getEnvironment();
    await prePopulateEntryIdCache(env);
    
    const blogIds = ["2422169", "2428077", "2351076"];
    blogIds.forEach(id => {
        console.log(`Blog ${id}:`, resolveEntryRef(id));
    });
    
    process.exit(0);
})();
