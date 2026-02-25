import fs from 'fs';

const data = JSON.parse(fs.readFileSync('./data/resources-cpt.json', 'utf8'));
const allFields = new Set();
data.slice(0, 10).forEach(item => {
    Object.keys(item).forEach(k => allFields.add(k));
});
console.log(Array.from(allFields));
