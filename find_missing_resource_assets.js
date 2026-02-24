import fs from 'fs';

try {
    const data = JSON.parse(fs.readFileSync('./data/resources-cpt.json', 'utf8'));
    const assetResponse = JSON.parse(fs.readFileSync('./data/assets.json', 'utf8'));
    const assets = assetResponse.data?.assets || assetResponse;

    const assetIds = new Set(assets.map(a => String(a.id)));
    const missing = new Set();

    data.forEach(item => {
        ['resourceCardImage', 'resourceBannerBackground', 'resourceBannerImage', 'resourceDocument', 'resourceVideo'].forEach(field => {
            if (item[field] && Array.isArray(item[field])) {
                item[field].forEach(id => {
                    if (!assetIds.has(String(id))) {
                        missing.add(String(id));
                    }
                });
            }
        });
    });

    console.log('Total missing assets in Resources:', missing.size);
    fs.writeFileSync('./data/missing_resource_assets.json', JSON.stringify(Array.from(missing), null, 2));
    console.log('Results saved to data/missing_resource_assets.json');
} catch (err) {
    console.error('ERROR:', err);
}
