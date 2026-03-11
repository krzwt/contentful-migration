import { getEnvironment } from "./config/contentful.js";

async function forceUpdate() {
    const env = await getEnvironment();

    const typesToHandle = ['sectionNavigationLinks', 'sectionNavigation'];
    const fieldsToHandle = {
        'sectionNavigationLinks': 'pageLink',
        'sectionNavigation': 'sectionPageLink'
    };

    for (const ctId of typesToHandle) {
        console.log(`\n🔍 Processing ${ctId}...`);
        const ct = await env.getContentType(ctId);
        const fieldId = fieldsToHandle[ctId];
        const field = ct.fields.find(f => f.id === fieldId);

        if (!field) {
            console.error(`❌ Field ${fieldId} not found in ${ctId}`);
            continue;
        }

        let validation = field.validations.find(v => v.linkContentType);
        if (!validation) {
            console.log(`Adding new validation block to ${fieldId}`);
            validation = { linkContentType: [] };
            field.validations.push(validation);
        }

        const requiredTypes = ["newSt", "newStBtu"];
        let changed = false;

        requiredTypes.forEach(t => {
            if (!validation.linkContentType.includes(t)) {
                console.log(`➕ Adding ${t} to ${ctId}.${fieldId}`);
                validation.linkContentType.push(t);
                changed = true;
            }
        });

        if (changed || ct.sys.version > (ct.sys.publishedVersion || 0)) {
            console.log(`📤 Updating and Publishing ${ctId} (Version: ${ct.sys.version})...`);
            const updated = await ct.update();
            await updated.publish();
            console.log(`✅ ${ctId} published successfully.`);
        } else {
            console.log(`ℹ️ ${ctId} is already up to date.`);
        }
    }
}

forceUpdate().catch(err => {
    console.error("🛑 FATAL ERROR:", err);
    process.exit(1);
});
