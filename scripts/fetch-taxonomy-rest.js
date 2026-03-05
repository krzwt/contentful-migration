import 'dotenv/config';
import fetch from 'node-fetch';

async function run() {
    const spaceId = process.env.CONTENTFUL_SPACE_ID;
    const token = process.env.CONTENTFUL_MANAGEMENT_TOKEN;

    if (!spaceId || !token) {
        console.error("Missing credentials");
        return;
    }

    console.log(`🔍 Fetching Taxonomy Concepts for Space: ${spaceId} via REST API...`);

    // According to Contentful CMA docs, the endpoint is /spaces/{space}/concepts
    const url = `https://api.contentful.com/spaces/${spaceId}/concepts`;

    try {
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/vnd.contentful.management.v1+json'
            }
        });

        if (!response.ok) {
            const text = await response.text();
            console.error(`❌ API Error (${response.status}): ${text}`);
            return;
        }

        const data = await response.json();
        console.log(`📊 Found ${data.items.length} concepts.`);

        data.items.forEach(c => {
            console.log(`- [${c.sys.id}] ${c.prefLabel?.['en-US'] || 'No Label'}`);
        });

    } catch (e) {
        console.error(`❌ Fetch error: ${e.message}`);
    }
}

run();
