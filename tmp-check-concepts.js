import contentful from 'contentful-management';
import 'dotenv/config';

async function run() {
    const client = contentful.createClient({
        accessToken: process.env.CONTENTFUL_MANAGEMENT_TOKEN
    });

    try {
        const space = await client.getSpace(process.env.CONTENTFUL_SPACE_ID);
        const environment = await space.getEnvironment(process.env.CONTENTFUL_ENVIRONMENT_ID || 'master');

        console.log(`\n🔍 Fetching taxonomy concepts for environment: ${environment.sys.id}...`);

        // Contentful Management API for Taxonomy
        const concepts = await environment.getTaxonomyConcepts();

        console.log(`✅ Found ${concepts.total} concepts.`);

        console.log("\nListing concept IDs that contain 'endpoint' or 'privilege':");
        concepts.items.forEach(c => {
            const id = c.sys.id;
            if (id.toLowerCase().includes('endpoint') || id.toLowerCase().includes('privilege')) {
                console.log(`- ID: ${id}`);
            }
        });

        console.log("\nAll concept IDs for debugging:");
        concepts.items.forEach(c => {
            console.log(`- ${c.sys.id}`);
        });

    } catch (e) {
        console.error("❌ ERROR FETCHING CONCEPTS:", e.message);
        if (e.details) console.error(JSON.stringify(e.details, null, 2));
    }
}

run();
