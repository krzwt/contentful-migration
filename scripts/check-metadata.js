import contentful from 'contentful-management';
import 'dotenv/config';

async function run() {
    const client = contentful.createClient({
        accessToken: process.env.CONTENTFUL_MANAGEMENT_TOKEN
    });

    try {
        const envId = process.env.CONTENTFUL_ENVIRONMENT || 'master';
        const space = await client.getSpace(process.env.CONTENTFUL_SPACE_ID);
        const env = await space.getEnvironment(envId);

        const entryId = 'st-sv-971328';
        console.log(`Checking metadata for entry: ${entryId}`);
        
        const entry = await env.getEntry(entryId);
        console.log("Metadata:", JSON.stringify(entry.metadata || {}, null, 2));

    } catch (e) {
        console.error("Error:", e.message);
    }
}

run();
