import homeHero from "./mappings/homeHero.json" with { type: "json" };
import calloutBarMapping from "./mappings/calloutBar.json" with { type: "json" };
import siteSectionMapping from "./mappings/siteSection.json" with { type: "json" };
import embedsMapping from "./mappings/embeds.json" with { type: "json" };
import formMapping from "./mappings/form.json" with { type: "json" };
import nonMarketingGetNotifiedFormMapping from "./mappings/nonMarketingGetNotifiedForm.json" with { type: "json" };

import { genericComponentHandler } from "./handlers/genericComponent.js";
import { createOrUpdateHero } from "./handlers/bannerHero.js";
import { createOrUpdateCalloutBar } from "./handlers/calloutBar.js";
import { createOrUpdateContentBlock } from "./handlers/contentBlock.js";
import { createOrUpdateQuotes } from "./handlers/quotes.js";
import { createOrUpdateQuote } from "./handlers/quote.js";
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
import { createOrUpdateIconGrid } from "./handlers/iconGrid.js";
import { createOrUpdateMediaBlock } from "./handlers/mediaBlock.js";
import { createOrUpdateOfficeLocations } from "./handlers/officeLocations.js";
import { createOrUpdateCalloutCards } from "./handlers/calloutCards.js";
import { createOrUpdateMediaEmbeds } from "./handlers/mediaEmbeds.js";
// Removed ctaBlock and contentCta handlers in favor of calloutBar


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
  calloutBar: { mapping: calloutBarMapping, handler: createOrUpdateCalloutBar },
  ctaBlock: { mapping: calloutBarMapping, handler: createOrUpdateCalloutBar },

  /* ---- New handlers ---- */
  quotes: { handler: createOrUpdateQuotes },
  quote: { handler: createOrUpdateQuote },
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
  contentCta: { handler: createOrUpdateCalloutBar },
  iconGrid: { handler: createOrUpdateIconGrid },
  mediaBlock: { handler: createOrUpdateMediaBlock },
  grid: { handler: createOrUpdateIconGrid },  // Direct mapping if used as top level
  cta: { handler: createOrUpdateCalloutBar }, // Direct mapping if used as top level
  fullWidthAsset: { handler: createOrUpdateMediaBlock },
  officeLocations: { handler: createOrUpdateOfficeLocations },
  calloutCards: { handler: createOrUpdateCalloutCards },
  mediaEmbed: { handler: createOrUpdateMediaEmbeds },
  mediaEmbeds: { handler: createOrUpdateMediaEmbeds },


  /* ---- Generic (mapping-based) ---- */
  homeHero: { mapping: homeHero, handler: genericComponentHandler },
  siteSection: { mapping: siteSectionMapping, handler: genericComponentHandler },
  embeds: { mapping: embedsMapping, handler: genericComponentHandler },
  form: { mapping: formMapping, handler: genericComponentHandler },
  nonMarketingGetNotifiedForm: { mapping: nonMarketingGetNotifiedFormMapping, handler: genericComponentHandler }
};
