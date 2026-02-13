const LOCALE = "en-US";
const CONTENT_TYPE = "bannerHero";

// 🔥 Keep mapping inside component
function mapVariant(variation) {
  switch (variation) {
    case "slimBanner":
      return "Banner Slim";

    case "mediaRight":
      return "Banner Media Right";

    case "mediaCenter":
      return "Banner Media Center";

    default:
      console.warn(
        "⚠ Unknown variation:",
        variation,
        "→ defaulting to Banner Slim"
      );
      return "Banner Slim";
  }
}

export async function createOrUpdateHero(env, heroData) {
  const existing = await env.getEntries({
    content_type: CONTENT_TYPE,
    "fields.blockId": heroData.blockId,
    limit: 1
  });

  let entry;

  if (existing.items.length) {
    entry = existing.items[0];
    console.log("🔄 Updating existing hero:", entry.sys.id);

    entry.fields.heading = { [LOCALE]: heroData.heading || "Untitled Hero" };
    entry.fields.layoutVariant = {
      [LOCALE]: mapVariant(heroData.variation)
    };
    entry.fields.description = { [LOCALE]: heroData.body || "" };

    try {
      entry = await entry.update();
      entry = await entry.publish();
    } catch (err) {
      console.error(`❌ Failed to update/publish hero "${heroData.blockId}":`, err.message);
      if (err.details) console.error("Validation Details:", JSON.stringify(err.details, null, 2));
      throw err;
    }
  } else {
    console.log("✨ Creating new hero");

    try {
      entry = await env.createEntry(CONTENT_TYPE, {
        fields: {
          blockId: { [LOCALE]: heroData.blockId },
          heading: { [LOCALE]: heroData.heading || "Untitled Hero" },
          layoutVariant: {
            [LOCALE]: mapVariant(heroData.variation)
          },
          description: { [LOCALE]: heroData.body || "" }
        }
      });

      entry = await entry.publish();
    } catch (err) {
      console.error(`❌ Failed to create/publish hero "${heroData.blockId}":`, err.message);
      if (err.details) console.error("Validation Details:", JSON.stringify(err.details, null, 2));
      throw err;
    }
  }

  return entry;
}
