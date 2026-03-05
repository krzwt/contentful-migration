import 'dotenv/config';
import fetch from 'node-fetch';

async function run() {
    const spaceId = process.env.CONTENTFUL_SPACE_ID;
    const envId = process.env.CONTENTFUL_ENVIRONMENT || 'stage';
    const token = process.env.CONTENTFUL_MANAGEMENT_TOKEN;

    const urls = [
        `https://api.contentful.com/spaces/${spaceId}/concepts`,
        `https://api.contentful.com/spaces/${spaceId}/environments/${envId}/concepts`,
        `https://api.contentful.com/spaces/${spaceId}/concept_schemes`,
        `https://api.contentful.com/spaces/${spaceId}/environments/${envId}/concept_schemes`
    ];

    for (const url of urls) {
        console.log(`\n🔍 Trying: ${url}`);
        try {
            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/vnd.contentful.management.v1+json'
                }
            });

            console.log(`Status: ${response.status}`);
            if (response.ok) {
                const data = await response.json();
                console.log(`✅ Success! Found ${data.items?.length || 0} items.`);
                if (data.items?.length > 0) {
                    data.items.slice(0, 5).forEach(c => console.log(`  - [${c.sys.id}] ${c.prefLabel?.['en-US'] || c.name || 'No Label'}`));
                }
            } else {
                const text = await response.text();
                // console.log(`  Error: ${text}`);
            }
        } catch (e) {
            console.error(`  Fetch error: ${e.message}`);
        }
    }
}

run();
