import { getEnvironment } from "./config/contentful.js";
import fs from "fs";

async function check() {
    const env = await getEnvironment();
    try {
        const cta = await env.getEntry('cta-quote-498340');
        fs.writeFileSync('cta-output.json', JSON.stringify(cta.fields, null, 2));
    } catch (e) {
        console.error(e.message);
    }
}

check();
