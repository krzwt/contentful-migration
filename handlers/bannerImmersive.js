import { convertHtmlToRichText } from "../utils/richText.js";
import { makeLink, upsertEntry } from "../utils/contentfulHelpers.js";

const LOCALE = "en-US";
const CONTENT_TYPE = "bannerImmersive";

export async function createOrUpdateBannerImmersive(env, bannerData, assetMap = null) {
    if (!env) {
        console.log(`   [DRY RUN] Would upsert ${CONTENT_TYPE}: ${bannerData.blockId}`);
        return { sys: { id: bannerData.blockId } };
    }

    const fields = {
        blockId: { [LOCALE]: String(bannerData.blockId || "") },
        heading: { [LOCALE]: (bannerData.heading || "").trim() },
        description: { [LOCALE]: await convertHtmlToRichText(env, bannerData.body || "") },
    };

    // Background Image
    if (bannerData.resourceBannerImage && bannerData.resourceBannerImage[0] && assetMap) {
        const assetId = String(bannerData.resourceBannerImage[0]);
        const assetInfo = assetMap.get(assetId);
        if (assetInfo && assetInfo.id) {
            fields.backgroundImage = { [LOCALE]: { sys: { type: "Link", linkType: "Asset", id: assetInfo.id } } };
        }
    }

    // Landscape Video
    if (bannerData.resourceVideo && bannerData.resourceVideo[0] && assetMap) {
        const assetId = String(bannerData.resourceVideo[0]);
        const assetInfo = assetMap.get(assetId);
        if (assetInfo && assetInfo.id) {
            if (assetInfo.wistiaUrl) {
                fields.landscapeVideoUrl = { [LOCALE]: assetInfo.wistiaUrl };
            } else {
                fields.landscapeVideo = { [LOCALE]: { sys: { type: "Link", linkType: "Asset", id: assetInfo.id } } };
            }
        }
    }

    // Use Landscape Image or Video (Switch)
    if (bannerData.switch !== undefined) {
        fields.useLandscapeImageOrVideo = { [LOCALE]: !!bannerData.switch };
    }

    // Authors / Hosts
    if (bannerData.people && bannerData.people.length > 0) {
        fields.authorsHosts = {
            [LOCALE]: bannerData.people.map(pid => makeLink(`person-${pid}`))
        };
    }

    return await upsertEntry(env, CONTENT_TYPE, bannerData.blockId, fields);
}
