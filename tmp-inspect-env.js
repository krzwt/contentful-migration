import contentful from 'contentful-management';
import dotenv from 'dotenv';
dotenv.config({ override: true });

async function run() {
    if (!process.env.CONTENTFUL_MANAGEMENT_TOKEN) {
        console.error("Missing CONTENTFUL_MANAGEMENT_TOKEN");
        return;
    }

    const client = contentful.createClient({
        accessToken: process.env.CONTENTFUL_MANAGEMENT_TOKEN
    });

    try {
        const space = await client.getSpace(process.env.CONTENTFUL_SPACE_ID);
        const environment = await space.getEnvironment(process.env.CONTENTFUL_ENVIRONMENT || 'stage');

        console.log("Environment object methods containing 'Concept' or 'Taxonomy':");
        let obj = environment;
        while (obj) {
            Object.getOwnPropertyNames(obj).forEach(prop => {
                const propLower = prop.toLowerCase();
                if (typeof environment[prop] === 'function' && (propLower.includes('concept') || propLower.includes('taxonomy'))) {
                    console.log(`- ${prop}`);
                }
            });
            obj = Object.getPrototypeOf(obj);
        }

    } catch (e) {
        console.error("Error:", e.message);
    }
}

run();
