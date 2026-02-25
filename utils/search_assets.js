import { getEnvironment } from "../config/contentful.js";
const LOCALE = "en-US";

async function findAssets() {
    const env = await getEnvironment();
    const titles = ["Pra icon", "Remote support icon"];

    for (const title of titles) {
        console.log(`Searching for asset with title: ${title}`);
        const assets = await env.getAssets({
            "fields.title": title,
            limit: 5
        });

        if (assets.items.length > 0) {
            assets.items.forEach(a => {
                console.log(`FOUND: ${a.fields.title[LOCALE]} - ID: ${a.sys.id}`);
            });
        } else {
            console.log(`NOT FOUND: ${title}`);
        }
    }
}

findAssets().catch(console.error);
