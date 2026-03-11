import { getEnvironment } from "./config/contentful.js";

async function checkAnyEntry() {
  const env = await getEnvironment();
  const ID = "3aenoKrEbPbjQsmmAR7jfF";
  try {
    const entry = await env.getEntry(ID);
    console.log(`✅ Found entry ${ID} of type: ${entry.sys.contentType.sys.id}`);
  } catch (err) {
    console.error(`❌ Entry ${ID} not found in any type.`);
  }
}

checkAnyEntry().catch(console.error);
