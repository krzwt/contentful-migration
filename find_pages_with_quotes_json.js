import fs from 'fs';

const files = [
    'standalone-content.json',
    'standalone-conversion.json',
    'standalone-thankyou.json',
    'standalone-microsite.json'
];

const results = {};

files.forEach(fileName => {
    const filePath = `./data/${fileName}`;
    if (!fs.existsSync(filePath)) return;

    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const matchingPages = data.filter(page => {
        const sections = page.sections || page.overviewContentStandalone || page.mainBannerStandalone || [];
        const sectionsArray = Array.isArray(sections) ? sections : Object.values(sections);
        return sectionsArray.some(section => section.type === 'quotes');
    });

    if (matchingPages.length > 0) {
        results[fileName] = matchingPages.map(p => p.id);
    }
});

fs.writeFileSync('quotes_pages_ids.json', JSON.stringify(results, null, 2));
console.log('Done.');
