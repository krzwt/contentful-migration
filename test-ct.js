const { getEnvironment } = require('./config/contentful.js');

async function test() {
    try {
        const env = await getEnvironment();
        const ct = await env.getContentType('addPartnerLogo');
        console.log("addPartnerLogo fields:");
        console.log(JSON.stringify(ct.fields, null, 2));

        console.log("\nLogo field check:");
        const urlField = ct.fields.find(f => f.id === 'url');
        console.log(JSON.stringify(urlField, null, 2));
    } catch (e) {
        console.error(e.message);
    }
}
test();
