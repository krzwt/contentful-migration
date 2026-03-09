import contentful from 'contentful-management';
import 'dotenv/config';
import fs from 'fs';

async function run() {
    const client = contentful.createClient({
        accessToken: process.env.CONTENTFUL_MANAGEMENT_TOKEN
    });

    try {
        const space = await client.getSpace(process.env.CONTENTFUL_SPACE_ID);
        const envId = process.env.CONTENTFUL_ENVIRONMENT || 'dev';
        const environment = await space.getEnvironment(envId);

        let results = "ID VALIDATION RESULTS:\n";
        
        const testIds = [
            'products',
            'services',
            'privilegeManagement',
            'privilegedRemoteAccess',
            'remoteSupport',
            'passwordSafe',
            'adBridge',
            'identitySecurityInsights',
            'entitle',
            'implementation',
            'upgradeMigration',
            'healthCheck'
        ];

        for (const id of testIds) {
            try {
                // Always fetch fresh to avoid 409
                const entry = await environment.getEntry('st-sv-947227');
                const originalConcepts = entry.metadata?.concepts || [];
                
                entry.metadata = {
                    ...entry.metadata,
                    concepts: [
                        { sys: { type: 'Link', linkType: 'TaxonomyConcept', id: id } }
                    ]
                };

                await entry.update();
                results += `✅ ${id}: VALID\n`;
                
                // Cleanup
                const refreshed = await environment.getEntry('st-sv-947227');
                refreshed.metadata.concepts = originalConcepts;
                await refreshed.update();
                
            } catch (err) {
                 results += `❌ ${id}: INVALID (${err.message})\n`;
            }
            // Small delay
            await new Promise(r => setTimeout(r, 500));
        }

        fs.writeFileSync('final-test-results.txt', results);
        console.log("Final results saved to final-test-results.txt");

    } catch (e) {
        console.error("❌ ERROR:", e.message);
    }
}

run();
