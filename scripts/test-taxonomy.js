import { getEnvironment } from '../config/contentful.js';

async function run() {
    try {
        const env = await getEnvironment();
        // Since getEnvironment does client.getSpace().getEnvironment(), 
        // we can navigate back to the space if needed, BUT wait.
        // The most reliable way is to redo the client creation as per getEnvironment.

        // Let's try to get the space from the env object if possible
        // Contentful SDK environment objects have a reference to the space 
        // or we can just use the ID from process.env.

        import contentful from 'contentful-management';
        const client = contentful.createClient({
            accessToken: process.env.CONTENTFUL_MANAGEMENT_TOKEN
        });
        const space = await client.getSpace(process.env.CONTENTFUL_SPACE_ID);

        console.log(`✅ Connected to Space: ${space.name}`);

        const concepts = await space.getConcepts();
        console.log(`📊 Found ${concepts.items.length} taxonomy concepts in space.`);

        const mapping = concepts.items.map(c => ({
            id: c.sys.id,
            name: c.prefLabel?.['en-US'] || 'No Label',
            scheme: c.conceptSchemes?.map(s => s.sys.id)
        }));

        console.log(JSON.stringify(mapping, null, 2));

    } catch (e) {
        console.error(`❌ Error: ${e.message}`);
        if (e.details) console.error(JSON.stringify(e.details, null, 2));
    }
}

run();
