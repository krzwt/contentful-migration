import { getEnvironment } from "./config/contentful.js";

async function touchEntries() {
    const env = await getEnvironment();
    const ids = ['secnav-link-945924', 'secnav-link-945925', 'secnav-link-945926'];

    for (const id of ids) {
        console.log(`Touching ${id}...`);
        try {
            const entry = await env.getEntry(id);
            // Re-save without changes to trigger validation
            const updated = await entry.update();
            try {
                await updated.publish();
                console.log(`✅ ${id} published.`);
            } catch (pubErr) {
                console.warn(`⚠️  Still cannot publish ${id}: ${pubErr.message}`);
                if (pubErr.details) {
                    console.warn(JSON.stringify(pubErr.details, null, 2));
                }
            }
        } catch (err) {
            console.error(`❌ Error fetching ${id}: ${err.message}`);
        }
    }
}

touchEntries();
