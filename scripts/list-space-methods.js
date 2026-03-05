import contentful from 'contentful-management';
import dotenv from 'dotenv';
dotenv.config({ override: true });

async function run() {
    const client = contentful.createClient({
        accessToken: process.env.CONTENTFUL_MANAGEMENT_TOKEN
    });

    try {
        const space = await client.getSpace(process.env.CONTENTFUL_SPACE_ID);
        console.log(`✅ Connected to Space: ${space.name}`);

        // List ALL methods on the space object
        const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(space));
        console.log("\n--- Space Methods ---");
        methods.sort().forEach(m => {
            if (!m.startsWith('_')) console.log(m);
        });

    } catch (e) {
        console.error(`❌ Error: ${e.message}`);
    }
}

run();
