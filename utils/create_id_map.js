import fs from 'fs';
const resources = JSON.parse(fs.readFileSync('./data/resources-cpt.json', 'utf-8'));
const map = {};
resources.forEach(item => {
    map[item.id] = item.typeId === 23 ? `webinar-${item.id}` : `resource-${item.id}`;
});
fs.writeFileSync('./data/resource_id_map.json', JSON.stringify(map, null, 2));
console.log('Resource ID map created');
