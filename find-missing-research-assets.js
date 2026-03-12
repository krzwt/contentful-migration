import fs from 'fs';
import { extractAssets } from './utils/assetDetector.js';

const RESEARCH_DATA_FILE = './data/NEW-Research.json';
const ASSET_FILES = [
    './data/assets.json',
    './data/resource-assets.json',
    './data/people-assets.json',
    './data/quote-assets.json'
];

if (!fs.existsSync(RESEARCH_DATA_FILE)) {
    console.error(`File not found: ${RESEARCH_DATA_FILE}`);
    process.exit(1);
}

const knownAssetIds = new Set();
const assetMetadataMap = new Map();

ASSET_FILES.forEach(filePath => {
    if (fs.existsSync(filePath)) {
        console.log(`Loading assets from ${filePath}...`);
        try {
            const metadata = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            const assets = metadata.data?.assets || metadata.assets;
            if (assets) {
                assets.forEach(a => {
                    const id = String(a.id);
                    knownAssetIds.add(id);
                    assetMetadataMap.set(id, a);
                });
            }
        } catch (e) {
            console.error(`Error parsing ${filePath}: ${e.message}`);
        }
    }
});

const researchData = JSON.parse(fs.readFileSync(RESEARCH_DATA_FILE, 'utf8'));
const researchAssets = extractAssets(researchData);
const researchAssetIds = Array.from(researchAssets.keys());

const missingAssetIds = researchAssetIds.filter(id => !knownAssetIds.has(id));

console.log(`\n--- Research Asset Analysis ---`);
console.log(`Total unique assets in Research: ${researchAssetIds.length}`);
console.log(`Total known assets (combined): ${knownAssetIds.size}`);
console.log(`Missing assets: ${missingAssetIds.length}`);

if (missingAssetIds.length > 0) {
    console.log('\n--- Missing Asset IDs ---');
    console.log(missingAssetIds.join(', '));
    
    const missingWithType = [];
    researchAssets.forEach((info, id) => {
        if (!knownAssetIds.has(id)) {
            missingWithType.push({ id, type: info.type });
        }
    });
    
    console.log('\n--- Missing Assets by Type ---');
    const grouped = missingWithType.reduce((acc, curr) => {
        acc[curr.type] = acc[curr.type] || [];
        acc[curr.type].push(curr.id);
        return acc;
    }, {});
    
    console.log(JSON.stringify(grouped, null, 2));

    const missingFilePath = './data/missing_research_assets.json';
    fs.writeFileSync(missingFilePath, JSON.stringify({
        total: missingAssetIds.length,
        missingAssetIds,
        grouped
    }, null, 2));
    console.log(`\nMissing assets saved to ${missingFilePath}`);

} else {
    console.log('\n✅ All assets are present in combined metadata files');
}
