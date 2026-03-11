import fs from 'fs';
const data = JSON.parse(fs.readFileSync('d:/Clients/Bluetext/beyond-trust/contentful-migration/data/forms-import.json', 'utf8'));
console.log(`Total entries: ${data.entries.length}`);
data.entries.forEach((e, i) => {
    console.log(`${i + 1}: ${e.fields.entryId['en-US']} (${e.fields.formName['en-US']})`);
});
