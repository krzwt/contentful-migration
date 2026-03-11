import { getEnvironment } from "./config/contentful.js";

async function searchSra() {
  const env = await getEnvironment();
  const entries = await env.getEntries({ query: "SRA" });
  console.log(`Found ${entries.items.length} entries matching 'SRA'.`);
  entries.items.forEach(e => {
    console.log(`- ID: ${e.sys.id}, Type: ${e.sys.contentType.sys.id}, Name: ${e.fields.title?.["en-US"] || e.fields.formName?.["en-US"] || e.fields.name?.["en-US"]}`);
  });
}

searchSra().catch(console.error);
