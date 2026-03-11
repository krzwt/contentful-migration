import { getEnvironment } from "./config/contentful.js";

async function listEmbedForms() {
  const env = await getEnvironment();
  const entries = await env.getEntries({ content_type: "embedFormsCpt" });
  console.log(`Found ${entries.items.length} Embed Forms.`);
  entries.items.forEach(e => {
    console.log(`- ID: ${e.sys.id}, Name: ${e.fields.formName?.["en-US"]}`);
  });
}

listEmbedForms().catch(console.error);
