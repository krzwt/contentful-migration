import { getEnvironment } from "./config/contentful.js";

async function checkForm() {
  const env = await getEnvironment();
  
  console.log("--- Checking Content Types ---");
  try {
     const ct = await env.getContentType("sraTrialForm");
     console.log("✅ Content Type 'sraTrialForm' exists.");
  } catch (e) {
     console.log("❌ Content Type 'sraTrialForm' NOT FOUND.");
  }

  console.log("\n--- Listing sraTrialForm Entries ---");
  try {
    const entries = await env.getEntries({ content_type: "sraTrialForm" });
    console.log(`Found ${entries.items.length} entries.`);
    entries.items.forEach(e => {
        console.log(`- ID: ${e.sys.id}, Title: ${e.fields.formName?.["en-US"] || "N/A"}, Published: ${!!e.sys.publishedVersion}`);
    });
  } catch (err) {
    console.error("❌ Error listing entries:", err.message);
  }

  console.log("\n--- Checking Specific siteForm ID ---");
  const SITE_FORM_ID = "3aenoKrEbPbjQsmmAR7jfF";
  try {
    const entry = await env.getEntry(SITE_FORM_ID);
    console.log("✅ Found Site Form:", entry.sys.id);
  } catch (err) {
    console.error("❌ Site Form not found:", SITE_FORM_ID);
  }
}

checkForm().catch(console.error);
