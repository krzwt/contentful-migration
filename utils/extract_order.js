import fs from 'fs';

function getFieldOrder(filePath, pageId, fieldName) {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const page = data.find(p => String(p.id) === String(pageId));
    if (!page || !page[fieldName]) return [];

    const ids = Object.keys(page[fieldName]);

    // Read raw text to find occurrences
    const content = fs.readFileSync(filePath, 'utf8');
    const pageIndex = content.indexOf(`"id": ${pageId}`);
    const fieldIndex = content.indexOf(`"${fieldName}":`, pageIndex);
    const nextIdIndex = content.indexOf('"id":', fieldIndex + 20);
    const segment = content.substring(fieldIndex, nextIdIndex === -1 ? content.length : nextIdIndex);

    const orderMap = ids.map(id => {
        return { id, index: segment.indexOf(`"${id}": {`) };
    });

    return orderMap.sort((a, b) => a.index - b.index).map(x => x.id);
}

const keys = getFieldOrder('d:/Clients/Bluetext/beyond-trust/contentful-migration/data/standalone-content.json', '2322913', 'overviewContentStandalone');
console.log('ORDERED KEYS:', keys);
