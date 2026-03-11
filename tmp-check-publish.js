import { getEnvironment } from "./config/contentful.js";

async function checkHeroPublish() {
  const env = await getEnvironment();
  const ID = "1ISpehqEslI6bRzGeJhHb4";
  try {
    const entry = await env.getEntry(ID);
    console.log(`✅ Found Hero ${ID}`);
    console.log("Published version:", entry.sys.publishedVersion);
  } catch (err) {
    console.error(`❌ Hero ${ID} not found.`);
  }
}

checkHeroPublish().catch(console.error);
