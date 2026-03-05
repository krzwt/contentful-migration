import dotenv from 'dotenv';
dotenv.config({ override: true });
import fetch from 'node-fetch';

async function run() {
    const spaceId = process.env.CONTENTFUL_SPACE_ID;
    const token = process.env.CONTENTFUL_MANAGEMENT_TOKEN;

    console.log(`Token ends with: ${token.slice(-5)}`);

    const url = `https://api.contentful.com/spaces/${spaceId}/taxonomy/concepts`;
    console.log(`🔍 Fetching: ${url}`);

    const response = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/vnd.contentful.management.v1+json'
        }
    });

    console.log(`Status: ${response.status}`);
    if (response.ok) {
        const data = await response.json();
        console.log(`✅ Success! Found ${data.items.length} concepts.`);
    } else {
        const text = await response.text();
        console.log(`❌ Error: ${text}`);
    }
}

run();
