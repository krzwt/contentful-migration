import { getEnvironment } from "./config/contentful.js";

async function checkEmbedFormSchema() {
  const env = await getEnvironment();
  const ct = await env.getContentType("embedFormsCpt");
  console.log("--- embedFormsCpt Fields ---");
  ct.fields.forEach(f => {
    console.log(`- ${f.id} (${f.type})`);
  });
}

checkEmbedFormSchema().catch(console.error);
