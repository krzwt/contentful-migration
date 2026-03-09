import fs from 'fs';
const data = JSON.parse(fs.readFileSync('d:/Clients/Bluetext/beyond-trust/contentful-migration/data/forms-import.json', 'utf8'));
console.log(`JSON Entries: ${data.entries.length}`);
const entries = data.entries.map(e => ({
    id: e.fields.entryId['en-US'],
    name: e.fields.formName['en-US'],
    src: e.fields.htmlEmbed['en-US'].match(/src=\"([^\"]+)\"/)?.[1] || 'No src'
}));
entries.forEach((e, i) => {
    console.log(`${String(i + 1).padStart(2)}: ID: ${e.id.padEnd(35)} | Name: ${e.name.padEnd(30)} | Src: ${e.src}`);
});
