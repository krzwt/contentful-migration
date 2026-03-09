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
        const originalConcepts = entry.metadata.concepts || [];

        console.log(`Checking potential IDs for "Course Format"...`);

        const testIds = ['courseFormat', 'courseFormats', 'trainingFormat', 'trainingFormats', 'trainingCategories', 'courseFormate'];

        for (const tid of testIds) {
            try {
                // Fetch fresh entry each time to avoid version conflict
                const freshEntry = await environment.getEntry(entryId);
                freshEntry.metadata = {
                    ...freshEntry.metadata,
                    concepts: [
                        { sys: { type: 'Link', linkType: 'TaxonomyConcept', id: tid } }
                    ]
                };
                await freshEntry.update();
                console.log(`✅ ${tid}: VALID`);

                // Reset concepts
                const resetEntry = await environment.getEntry(entryId);
                resetEntry.metadata.concepts = originalConcepts;
                await resetEntry.update();

            } catch (err) {
                console.log(`❌ ${tid}: INVALID (${err.message})`);
            }
        }

    } catch (e) {
        console.error("Error:", e.message);
    }
}

run();
