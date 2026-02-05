/**
 * textSection component handler
 * Transforms Craft textSection component data to Contentful format
 */

export async function transformTextSection(craftData, mapping, utils) {
  try {
    const { normalizeText, convertToRichText } = utils;

    const contentfulData = {
      fields: {
        title: {
          'en-US': normalizeText(craftData.title)
        },
        content: {
          'en-US': await convertToRichText(craftData.content)
        }
      }
    };

    if (craftData.subtitle) {
      contentfulData.fields.subtitle = {
        'en-US': normalizeText(craftData.subtitle)
      };
    }

    return contentfulData;
  } catch (error) {
    console.error('Error transforming textSection:', error);
    throw error;
  }
}

export default transformTextSection;
