import contentful from 'contentful-management';
import 'dotenv/config';

async function run() {
    const client = contentful.createClient({
        accessToken: process.env.CONTENTFUL_MANAGEMENT_TOKEN
    });

    try {
        const space = await client.getSpace(process.env.CONTENTFUL_SPACE_ID);
        console.log("Listing methods for Space object:");

        let obj = space;
        while (obj) {
            Object.getOwnPropertyNames(obj).forEach(prop => {
                if (typeof space[prop] === 'function' && prop.toLowerCase().includes('concept')) {
                    console.log(`- ${prop}`);
                }
            });
            obj = Object.getPrototypeOf(obj);
        }

        console.log("\nTrying all possible concept method names on space:");
        const methods = ['getConcepts', 'getTaxonomyConcepts', 'getTaxonomy', 'getTaxonomies'];
        for (const m of methods) {
            console.log(`  Checking ${m}: ${typeof space[m]}`);
            if (typeof space[m] === 'function') {
                try {
                    const res = await space[m]();
                    console.log(`    ✅ SUCCESS with ${m}!`);
                } catch (e) {
                    console.log(`    ❌ FAILED with ${m}: ${e.message}`);
                }
            }
        }

    } catch (e) {
        console.error(e.message);
    }
}

run();
