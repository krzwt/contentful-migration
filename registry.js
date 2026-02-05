import { handleHomeHero } from "./handlers/homeHero.js";

export const COMPONENTS = {
  mainBannerStandalone: {
    handler: handleHomeHero
  }

  // later:
  // textWithImage: { handler: handleTextWithImage },
  // accordion: { handler: handleAccordion }
};
