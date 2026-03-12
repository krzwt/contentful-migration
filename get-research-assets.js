import fs from 'fs';
import { extractAssets } from './utils/assetDetector.js';

const DATA_FILE = './data/NEW-Research.json';

if (!fs.existsSync(DATA_FILE)) {
    console.error(`File not found: ${DATA_FILE}`);
    process.exit(1);
}

const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
const assets = extractAssets(data);

console.log('--- Comma Separated Asset IDs ---');
console.log(Array.from(assets).join(', '));

console.log('\n--- List of Asset IDs ---');
assets.forEach(id => console.log(id));

console.log(`\nTotal assets found: ${assets.size}`);
