import fs from "fs";
import {
  getEnvironment
} from "./config/contentful.js";
import {
  createOrUpdateHero
} from "./handlers/bannerHero.js";
import {
  attachHeroToPage
} from "./handlers/pageHandler.js";

async function run() {
  const env = await getEnvironment();

  console.log("✅ Connected to Contentful");

  const data = JSON.parse(
    fs.readFileSync("./data/test-2.json", "utf-8")
  );

  for (const page of data) {
  console.log("\n➡️ Page:", page.title);

  if (!page.slimBanner) {
    console.log("❌ No slimBanner found");
    continue;
  }

  const banners = page.slimBanner;

  for (const blockId in banners) {
    const block = banners[blockId];

    if (!block.enabled) continue;

    const fields = block.fields;

    console.log("✅ Hero detected with blockId:", blockId);

    const heroEntry = await createOrUpdateHero(env, {
      blockId: blockId,
      heading: fields.headingSection || page.heading45 || page.title,
      body: fields.body180 || fields.description,
      variation: "slimBanner"
    });


    await attachHeroToPage(env, page.title, heroEntry);
  }
}


  console.log("\n🚀 Migration Complete");
}

run().catch(console.error);