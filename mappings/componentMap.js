export const componentMap = {
  homeHero: {
    craftHandle: "homeHero",
    contentfulType: "homeHero",
    fields: {
      id: "blockId",
      headingSection: "heroTitle",
      descSection: "heroDescription"
    }
  },

  slimBanner: {
    craftHandle: "slimBanner",
    contentfulType: "bannerHero",
    fields: {
      id: "blockId",
      heading: "title",
      description: "description"
    }
  },

  resourceTabs: {
    craftHandle: "resourceTabs",
    contentfulType: "resourceTabs",
    fields: {
      id: "blockId",
      heading: "title",
      items: "tabs"
    }
  }
};
