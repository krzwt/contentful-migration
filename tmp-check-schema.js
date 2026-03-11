import { getEnvironment } from "./config/contentful.js";

async function checkBannerHeroSchema() {
  const env = await getEnvironment();
  const ct = await env.getContentType("bannerHero");
  console.log("--- bannerHero Fields ---");
  ct.fields.forEach(f => {
    console.log(`- ${f.id} (${f.type})`);
    if (f.id === "mainBannerForm") {
      console.log("  Validations:", JSON.stringify(f.validations, null, 2));
    }
  });
}

checkBannerHeroSchema().catch(console.error);
