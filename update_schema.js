import "dotenv/config";
import { getEnvironment } from "./config/contentful.js";

async function updateThankYouPage(env) {
    console.log("Checking content type 'newStandaloneThankYou'...");
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
        console.log("   ✅ 'tryItCta' is already allowed.");
    } else {
        console.log("   ➕ Adding 'tryItCta' to allowed content types...");
        validations.push("tryItCta");
        const updated = await ct.update();
        await updated.publish();
        console.log("   ✅ Successfully updated 'newStandaloneThankYou'.");
    }
}

async function fixContactInfoPhoneValidation(env) {
    console.log("Checking content type 'contactInfo'...");
    const ct = await env.getContentType("contactInfo");

    const phoneField = ct.fields.find(f => f.id === "phone");
    if (!phoneField) {
        console.error("Could not find 'phone' field.");
        return;
    }

    // Update to a more flexible international phone regex
    const internationalPhoneRegex = "^\\+?[\\d\\s.\\-()]{7,25}$";

    // Check if it already has this regex
    const hasCorrectRegex = phoneField.validations?.some(v => v.regexp?.pattern === internationalPhoneRegex);

    if (hasCorrectRegex) {
        console.log("   ✅ Phone field already has the flexible international regex.");
    } else {
        console.log("   🔄 Updating phone regex to allow international formats...");
        // Filter out existing regexp validations
        phoneField.validations = (phoneField.validations || []).filter(v => !v.regexp);
        // Add the new one
        phoneField.validations.push({
            regexp: {
                pattern: internationalPhoneRegex,
                flags: ""
            },
            message: "Please enter a valid phone number (international formats supported)."
        });

        const updated = await ct.update();
        await updated.publish();
        console.log("   ✅ Successfully updated 'contactInfo' with flexible phone validation.");
    }
}

async function run() {
    const env = await getEnvironment();
    await updateThankYouPage(env);
    await fixContactInfoPhoneValidation(env);
    console.log("\n🚀 All schema updates complete.");
}

run()
    .catch(err => {
        console.error("Error updating schema:", err);
        if (err.details) console.error("Details:", JSON.stringify(err.details, null, 2));
    });