import contentful from 'contentful-management';
import 'dotenv/config';
import fs from 'fs';

async function run() {
    console.log("🔍 Syncing Contentful Taxonomy...");

    if (!process.env.CONTENTFUL_MANAGEMENT_TOKEN || !process.env.CONTENTFUL_SPACE_ID) {
        console.error("❌ Missing CONTENTFUL_MANAGEMENT_TOKEN or CONTENTFUL_SPACE_ID in .env");
        return;
    }

    const client = contentful.createClient({
        accessToken: process.env.CONTENTFUL_MANAGEMENT_TOKEN
    });

    try {
        const space = await client.getSpace(process.env.CONTENTFUL_SPACE_ID);
        console.log(`✅ Connected to Space: ${space.name}`);

        console.log("📥 Fetching Concepts...");
        const response = await space.getConcepts();

        const concepts = response.items.map(c => ({
            id: c.sys.id,
            name: c.prefLabel?.['en-US'] || 'No Label',
            schemes: c.conceptSchemes?.map(s => s.sys.id) || []
        }));

        console.log(`📊 Found ${concepts.length} concepts.`);

        const output = {
            syncedAt: new Date().toISOString(),
            spaceId: process.env.CONTENTFUL_SPACE_ID,
            concepts: concepts
        };

        const outputPath = './data/contentful-taxonomy.json';
        fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
        console.log(`💾 Saved taxonomy to ${outputPath}`);

        // Also print a summary for the user
        console.log("\n--- Top Concepts ---");
        concepts.slice(0, 20).forEach(c => {
            console.log(`${c.id.padEnd(25)} | ${c.name}`);
        });

    } catch (e) {
        console.error(`❌ Error syncing taxonomy: ${e.message}`);
        if (e.details) {
            console.error("Details:", JSON.stringify(e.details, null, 2));
        }
    }
}

run();
