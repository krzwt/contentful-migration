import contentful from 'contentful-management';
import dotenv from 'dotenv';
dotenv.config({ override: true });

async function run() {
    const client = contentful.createClient({
        accessToken: process.env.CONTENTFUL_MANAGEMENT_TOKEN
    });

    try {
        const space = await client.getSpace(process.env.CONTENTFUL_SPACE_ID);
        const environment = await space.getEnvironment(process.env.CONTENTFUL_ENVIRONMENT || 'stage');

        console.log("Fetching all concepts...");

        // This is the correct way to get concepts via the management client
        const taxonomy = await environment.getTaxonomyConcepts();

        for (const item of taxonomy.items) {
            console.log(`ID: ${item.sys.id} | Name: ${item.prefLabel['en-US'] || item.sys.id}`);
        }

    } catch (e) {
        console.error("Error:", e.message);
    }
}

run();
