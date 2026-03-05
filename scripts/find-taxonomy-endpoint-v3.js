import 'dotenv/config';
import fetch from 'node-fetch';

async function run() {
    const spaceId = process.env.CONTENTFUL_SPACE_ID;
    const token = process.env.CONTENTFUL_MANAGEMENT_TOKEN;

    const baseUrls = [
        'https://api.contentful.com',
        'https://api.eu.contentful.com'
    ];

    const paths = [
        `/spaces/${spaceId}/taxonomy/concepts`,
        `/spaces/${spaceId}/concepts`,
        `/spaces/${spaceId}/taxonomy/schemes`,
        `/spaces/${spaceId}/environments/stage/taxonomy/concepts`
    ];

    for (const baseUrl of baseUrls) {
        for (const path of paths) {
            const url = `${baseUrl}${path}`;
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
                        data.items.slice(0, 10).forEach(c => console.log(`  - [${c.sys.id}] ${c.prefLabel?.['en-US'] || c.name || 'No Label'}`));
                        return; // Stop if we found one
                    }
                }
            } catch (e) {
                console.error(`  Fetch error: ${e.message}`);
            }
        }
    }
}

run();
