import fs from 'fs';

const filePath = 'd:/Clients/Bluetext/beyond-trust/contentful-migration/data/forms-import.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

data.entries.forEach(entry => {
    const fields = entry.fields;

    // Default embedSource
    if (!fields.embedSource || fields.embedSource["en-US"] === "") {
        fields.embedSource = { "en-US": "contentful" };
    }

    // For other fields, if they are empty strings, let's remove them to avoid validation errors with "in" rules (like lang)
    ["lang", "sfcid", "product", "redirectUrl"].forEach(key => {
        if (fields[key] && fields[key]["en-US"] === "") {
            delete fields[key];
        }
    });
});

fs.writeFileSync(filePath, JSON.stringify(data, null, 4), 'utf8');
console.log('Successfully cleaned forms-import.json for migration.');
