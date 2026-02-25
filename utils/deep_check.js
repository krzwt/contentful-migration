import fs from 'fs';
const data = JSON.parse(fs.readFileSync('./data/resources-cpt.json', 'utf-8'));
const searchIds = [1262969, 1890165, 67583, 2448451, 2427206, 2313738, 2435489, 2431532, 2451308];
searchIds.forEach(searchId => {
    const found = data.find(item => item.id === searchId || item.id === String(searchId));
    if (found) {
        console.log(`FOUND ${searchId}: ${found.title}`);
    } else {
        console.log(`NOT FOUND ${searchId}`);
    }
});
