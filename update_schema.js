import "dotenv/config";
import { getEnvironment } from "./config/contentful.js";

async function updateSchema() {
    const env = await getEnvironment();
    console.log("Fetching content type 'newStandaloneThankYou'...");
    const ct = await env.getContentType("newStandaloneThankYou");

    const sectionsField = ct.fields.find(f => f.id === "sections");
    if (!sectionsField) {
        console.error("Could not find 'sections' field.");
        return;
    }

    const validations = sectionsField.items?.validations?.[0]?.linkContentType;
    if (!validations) {
        console.error("Could not find linkContentType validations on 'sections' field.");
        return;
    }

    if (validations.includes("tryItCta")) {
        console.log("'tryItCta' is already allowed on 'newStandaloneThankYou'.");
    } else {
        console.log("Adding 'tryItCta' to allowed content types...");
        validations.push("tryItCta");
        const updated = await ct.update();
        await updated.publish();
        console.log("Successfully updated and published 'newStandaloneThankYou' schema.");
    }
}

updateSchema().catch(err => {
    console.error("Error updating schema:", err);
    if (err.details) console.error("Details:", JSON.stringify(err.details, null, 2));
});
