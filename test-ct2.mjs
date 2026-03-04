import { getEnvironment } from './config/contentful.js';

async function test() {
    try {
        const env = await getEnvironment();
        const cts = await env.getContentTypes();
        cts.items.forEach(ct => {
            const hasAssetRef = ct.fields.some(f => f.type === 'Link' && f.linkType === 'Asset');
            // See if this struct contains "caption" and "cta"
            const hasCaption = ct.fields.some(f => f.name.toLowerCase().includes('caption'));
            const hasCta = ct.fields.some(f => f.name.toLowerCase() === 'cta');
            if (hasAssetRef && hasCaption && hasCta) {
                console.log('Match CT:', ct.sys.id, ct.name);
                console.log(ct.fields.map(f => `${f.id} (${f.name}, type:${f.type})`))
            }
        });
    } catch (e) {
        console.error(e.message);
    }
}
test();
