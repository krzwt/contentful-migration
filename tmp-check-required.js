import { getEnvironment } from "./config/contentful.js";

async function checkEmbedFormRequired() {
  const env = await getEnvironment();
  const ct = await env.getContentType("embedFormsCpt");
  console.log("--- embedFormsCpt Fields ---");
  ct.fields.forEach(f => {
    console.log(`- ${f.id} (Required: ${f.required})`);
  });
}

checkEmbedFormRequired().catch(console.error);
