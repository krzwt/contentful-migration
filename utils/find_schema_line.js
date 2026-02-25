import fs from 'fs';
const content = fs.readFileSync('./data/contentful-schema.json', 'utf-8');
const lines = content.split('\n');
lines.forEach((line, i) => {
    if (line.trim().includes('"pageSettings": {')) {
        console.log(`Found "${line.trim()}" at line ${i + 1}`);
    }
});
