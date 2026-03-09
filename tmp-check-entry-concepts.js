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

        const entryId = 'stbtu-2483563';
        const entry = await environment.getEntry(entryId);

        console.log(`Concepts for ${entryId}:`);
        console.log(JSON.stringify(entry.metadata.concepts, null, 2));

    } catch (e) {
        console.error("Error:", e.message);
    }
}

run();
