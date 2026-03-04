import { getEnvironment } from './config/contentful.js';

async function test() {
    try {
        const env = await getEnvironment();
        const { items } = await env.getContentTypes();
        const match = items.find(ct => ct.name.toLowerCase().includes('logo'));
        console.log("Matching content type:", match && match.name, match && match.sys.id);

        const possibleCTs = items.filter(ct => ct.name.toLowerCase().includes('logo'));
        console.log("All matching CTs:", possibleCTs.map(c => c.sys.id + " (" + c.name + ")"));

        if (possibleCTs.length > 0) {
            console.log("\nFields for", possibleCTs[0].sys.id);
            console.log(possibleCTs[0].fields.map(f => `${f.id} (${f.name})`));
        }
        if (possibleCTs.length > 1) {
            console.log("\nFields for", possibleCTs[1].sys.id);
            console.log(possibleCTs[1].fields.map(f => `${f.id} (${f.name})`));
        }

    } catch (e) {
        console.error(e.message);
    }
}
test();
