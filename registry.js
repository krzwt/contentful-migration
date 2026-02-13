import homeHero from "./mappings/homeHero.json" with { type: "json" };
import overviewContent from "./mappings/overviewContent.json" with { type: "json" };

import { genericComponentHandler } from "./handlers/genericComponent.js";

export const COMPONENTS = {
  slimBanner: {
    contentType: "bannerHero",
    mapping: slimBannerMapping,
    handler: genericComponentHandler
  },
  embedContent: {
    contentType: "resourceTabbed",
    mapping: resourceTabbedMapping,
    handler: genericComponentHandler
  }
};
