import { getEnvironment } from "./config/contentful.js";

async function checkHero() {
  const env = await getEnvironment();
  const ID = "1ISpehqEslI6bRzGeJhHb4";
  try {
    const entry = await env.getEntry(ID);
    console.log(`✅ Found Hero ${ID}`);
    console.log("mainBannerForm:", JSON.stringify(entry.fields.mainBannerForm, null, 2));
  } catch (err) {
    console.error(`❌ Hero ${ID} not found.`);
  }
}

checkHero().catch(console.error);
