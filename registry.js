import homeHero from "./mappings/homeHero.json" with { type: "json" };
import overviewContent from "./mappings/overviewContent.json" with { type: "json" };
import bannerHeroMapping from "./mappings/bannerHero.json" with { type: "json" };

import { genericComponentHandler } from "./handlers/genericComponent.js";
import { createOrUpdateHero } from "./handlers/bannerHero.js";

export const COMPONENTS = {
  banner: {
    handler: createOrUpdateHero
  },
  bannerSlim: {
    handler: createOrUpdateHero
  },
  slimBanner: {
    handler: createOrUpdateHero
  },
  bannerMediaRight: {
    handler: createOrUpdateHero
  },
  bannerMediaCenter: {
    handler: createOrUpdateHero
  },
  bannerHero: {
    handler: createOrUpdateHero
  },
  contentBlock: {
    mapping: overviewContent,
    handler: genericComponentHandler
  },
  homeHero: {
    mapping: homeHero,
    handler: genericComponentHandler
  }
};
