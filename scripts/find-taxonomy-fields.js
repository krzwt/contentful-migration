import fs from 'fs';
const schema = JSON.parse(fs.readFileSync('d:/client/bluetext/beyondtrust/contentful-migration/data/contentful-schema.json', 'utf-8'));

for (const [ctId, ct] of Object.entries(schema)) {
    if (!ct.fields) continue;
    for (const [fId, f] of Object.entries(ct.fields)) {
        if (f.items && f.items.validations) {
            for (const v of f.items.validations) {
                if (v.linkContentType && v.linkContentType.includes('TaxonomyConcept')) {
                    console.log(`Array -> CT: ${ctId}, Field: ${fId} (${f.name})`);
                }
            }
        }
        if (f.validations) {
            for (const v of f.validations) {
                if (v.linkContentType && v.linkContentType.includes('TaxonomyConcept')) {
                    console.log(`Single -> CT: ${ctId}, Field: ${fId} (${f.name})`);
                }
            }
        }
    }
}
