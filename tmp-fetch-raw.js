import 'dotenv/config';

async function run() {
    const spaceId = process.env.CONTENTFUL_SPACE_ID;
    const environmentId = process.env.CONTENTFUL_ENVIRONMENT || 'stage';
    const token = process.env.CONTENTFUL_MANAGEMENT_TOKEN;

    const url = `https://api.contentful.com/spaces/${spaceId}/environments/${environmentId}/taxonomy/concepts`;

    try {
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            console.error("HTTP error!", response.status);
            const text = await response.text();
            console.log(text);
            return;
        }

        const data = await response.json();
        console.log("Taxonomy Concepts:");
        data.items.forEach(c => {
            console.log(`- ${c.sys.id}`);
        });

    } catch (e) {
        console.error("Error:", e.message);
    }
}

run();
