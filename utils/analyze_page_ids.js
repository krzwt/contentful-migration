import fs from 'fs';
const data = JSON.parse(fs.readFileSync('./data/standalone-content.json', 'utf-8'));
const page = data.find(p => String(p.id) === '2397982');

function findIds(obj, path = '') {
    if (!obj || typeof obj !== 'object') return;
    for (const [key, value] of Object.entries(obj)) {
        if (Array.isArray(value)) {
            if (['image', 'video', 'pdf', 'document', 'resourceCardImage', 'resourceBannerImage', 'resourceDocument', 'resourceVideo', 'entries'].includes(key)) {
                console.log(`Path: ${path}.${key} -> IDs: ${value.join(', ')}`);
            }
            value.forEach((v, i) => findIds(v, `${path}.${key}[${i}]`));
        } else {
            findIds(value, `${path}.${key}`);
        }
    }
}

console.log(`Analyzing page: ${page.title} (${page.id})`);
findIds(page);
