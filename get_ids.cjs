const fs = require('fs');
const content = fs.readFileSync('d:\\Clients\\Bluetext\\beyond-trust\\contentful-migration\\data\\standalone-conversion.json', 'utf8');
const matches = content.match(/"typeId":\s*(\d+)/g);
const ids = new Set(matches.map(m => m.split(':')[1].trim()));
console.log(Array.from(ids).sort());
