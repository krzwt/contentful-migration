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

        console.log(`Trying to add courseFormat to metadata of ${entryId}...`);

        entry.metadata = {
            ...entry.metadata,
            concepts: [
                ...entry.metadata.concepts,
                { sys: { type: 'Link', linkType: 'TaxonomyConcept', id: 'courseFormat' } }
            ]
        };

        const result = await entry.update();
        console.log("Successfully updated with courseFormat!");

    } catch (e) {
        console.error("Error:", e.message);
        if (e.details && e.details.errors) {
            console.log(JSON.stringify(e.details.errors, null, 2));
        }
    }
}

run();
