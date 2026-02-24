import fs from 'fs';

const data = JSON.parse(fs.readFileSync('./data/general-categories.json', 'utf8'));
const parents = new Map();
data.forEach(c => {
    const p = c.parentId || 'root';
    if (!parents.has(p)) parents.set(p, []);
    parents.get(p).push({ id: c.id, title: c.title });
});

for (const [p, items] of parents) {
    console.log(`Parent ${p}: ${items.length} items`);
    if (items.length < 50) {
        items.forEach(i => console.log(`  - ${i.title} (ID: ${i.id})`));
    }
}
