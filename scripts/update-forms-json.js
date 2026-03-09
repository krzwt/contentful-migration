import fs from 'fs';

const filePath = 'd:/Clients/Bluetext/beyond-trust/contentful-migration/data/forms-import.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

data.entries.forEach(entry => {
    const fields = entry.fields;

    // Add new fields with default or empty values
    if (!fields.embedSource) {
        fields.embedSource = { "en-US": "contentful" };
    }
    if (!fields.lang) {
        fields.lang = { "en-US": "" };
    }
    if (!fields.sfcid) {
        fields.sfcid = { "en-US": "" };
    }
    if (!fields.product) {
        fields.product = { "en-US": "" };
    }
    if (!fields.redirectUrl) {
        fields.redirectUrl = { "en-US": "" };
    }
});

fs.writeFileSync(filePath, JSON.stringify(data, null, 4), 'utf8');
console.log('Successfully updated forms-import.json with new fields.');
