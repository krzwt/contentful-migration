import { getEnvironment } from "./config/contentful.js";

async function listContentTypes() {
  const env = await getEnvironment();
  const cts = await env.getContentTypes();
  console.log("--- Content Types ---");
  cts.items.forEach(ct => {
    console.log(`- ${ct.sys.id} (${ct.name})`);
  });
}

listContentTypes().catch(console.error);
