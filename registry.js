import homeHero from "./mappings/homeHero.json" with { type: "json" };
import overviewContent from "./mappings/overviewContent.json" with { type: "json" };

import { genericComponentHandler } from "./handlers/genericComponent.js";

export const COMPONENTS = {
  mainBannerStandalone: {
    handler: genericComponentHandler,
    mapping: homeHero
  },
  overviewContentStandalone: {
    handler: genericComponentHandler,
    mapping: overviewContent
  }
};
