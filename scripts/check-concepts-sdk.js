import contentful from 'contentful-management';
import dotenv from 'dotenv';
dotenv.config({ override: true });

async function run() {
    const client = contentful.createClient({
        accessToken: process.env.CONTENTFUL_MANAGEMENT_TOKEN
    });

    try {
        const space = await client.getSpace(process.env.CONTENTFUL_SPACE_ID);
        console.log(`Connected to Space: ${space.name}`);

        // Check features
        // In newer SDKs, space.getDetails() or similar might exist
        // But let's just try to call concepts() directly
        // Some SDK versions use space.concepts.getMany()

        console.log("Checking for space.concepts...");
        if (space.concepts) {
            console.log("Found space.concepts! Fetching...");
            const concepts = await space.concepts.getMany();
            console.log(`Found ${concepts.items.length} concepts.`);
        } else {
            console.log("space.concepts NOT found.");
        }

    } catch (e) {
        console.error(e.message);
    }
}

run();
