import { getEnvironment } from "./config/contentful.js";

async function checkFormComponentSchema() {
  const env = await getEnvironment();
  const ct = await env.getContentType("formComponent");
  console.log("--- formComponent Fields ---");
  ct.fields.forEach(f => {
    console.log(`- ${f.id} (${f.type})`);
  });
}

checkFormComponentSchema().catch(console.error);
