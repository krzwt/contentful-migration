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

        console.log(`Checking concepts in ${process.env.CONTENTFUL_SPACE_ID} / ${process.env.CONTENTFUL_ENVIRONMENT || 'stage'}`);

        const concepts = await environment.getTaxonomyConcepts();
        console.log("Found concepts:");
        concepts.items.forEach(c => {
            console.log(`- ${c.sys.id}`);
        });

    } catch (e) {
        console.error("Error:", e.message);
        if (e.details) console.log(JSON.stringify(e.details, null, 2));
    }
}

run();
