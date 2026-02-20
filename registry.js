import homeHero from "./mappings/homeHero.json" with { type: "json" };
import ctaBlockMapping from "./mappings/ctaBlock.json" with { type: "json" };

import { genericComponentHandler } from "./handlers/genericComponent.js";
import { createOrUpdateHero } from "./handlers/bannerHero.js";
import { createOrUpdateCtaBlock } from "./handlers/ctaBlock.js";
import { createOrUpdateContentBlock } from "./handlers/contentBlock.js";
import { createOrUpdateQuotes } from "./handlers/quotes.js";
import { createOrUpdateUseCases } from "./handlers/useCases.js";
import { createOrUpdateProcessFlow } from "./handlers/processFlow.js";
import { createOrUpdateFeatureGrid } from "./handlers/featureGrid.js";
import { createOrUpdateCardGrid } from "./handlers/cardGrid.js";
import { createOrUpdateCustomerBundle } from "./handlers/customerBundle.js";
import { createOrUpdateLogoList } from "./handlers/logoList.js";
import { createOrUpdateReviews } from "./handlers/reviews.js";
import { createOrUpdateStatistics } from "./handlers/statistics.js";
import { createOrUpdateAccordion } from "./handlers/accordion.js";
import { createOrUpdateTable } from "./handlers/table.js";
import { createOrUpdateFaqs } from "./handlers/faqs.js";
import { createOrUpdateFeatureTabbed } from "./handlers/featureTabbed.js";
import { createOrUpdateResourceTabbed } from "./handlers/resourceTabbed.js";
import { createOrUpdateTryCta } from "./handlers/tryItCta.js";
import { createOrUpdateContactSales } from "./handlers/contactSales.js";

export const COMPONENTS = {
  /* ---- Banner variants ---- */
  banner: { handler: createOrUpdateHero },
  bannerSlim: { handler: createOrUpdateHero },
  slimBanner: { handler: createOrUpdateHero },
  bannerMediaRight: { handler: createOrUpdateHero },
  bannerMediaCenter: { handler: createOrUpdateHero },
  bannerHero: { handler: createOrUpdateHero },

  /* ---- Content blocks ---- */
  contentBlock: { handler: createOrUpdateContentBlock },
  calloutBar: { mapping: ctaBlockMapping, handler: createOrUpdateCtaBlock },

  /* ---- New handlers ---- */
  quotes: { handler: createOrUpdateQuotes },
  useCases: { handler: createOrUpdateUseCases },
  processFlow: { handler: createOrUpdateProcessFlow },
  featureGrid: { handler: createOrUpdateFeatureGrid },
  cardGrid: { handler: createOrUpdateCardGrid },
  customerBundle: { handler: createOrUpdateCustomerBundle },
  logoList: { handler: createOrUpdateLogoList },
  reviews: { handler: createOrUpdateReviews },
  statistics: { handler: createOrUpdateStatistics },
  accordion: { handler: createOrUpdateAccordion },
  table: { handler: createOrUpdateTable },
  faqs: { handler: createOrUpdateFaqs },
  featureTabbed: { handler: createOrUpdateFeatureTabbed },
  resourceTabbed: { handler: createOrUpdateResourceTabbed },
  tryItCta: { handler: createOrUpdateTryCta },
  contactSales: { handler: createOrUpdateContactSales },

  /* ---- Generic (mapping-based) ---- */
  homeHero: { mapping: homeHero, handler: genericComponentHandler }
};
