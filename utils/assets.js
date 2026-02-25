import path from "path";
import fetch from "node-fetch";
import mime from "mime-types";

export async function findExistingAssetByUrl(env, imageUrl) {
  const assets = await env.getAssets({
    "fields.description[match]": imageUrl,
    limit: 1
  });

  return assets.items.length ? assets.items[0].sys.id : null;
}

export async function uploadImageFromUrl(env, imageUrl, locale = "en-US") {
  try {
    const existing = await findExistingAssetByUrl(env, imageUrl);
    if (existing) {
      console.log("♻️ Reusing existing asset");
      return existing;
    }

    const response = await fetch(imageUrl);
    if (!response.ok) return null;

    const buffer = await response.arrayBuffer();
    const contentType =
      response.headers.get("content-type") ||
      mime.lookup(imageUrl) ||
      "image/jpeg";

    const fileName = path.basename(new URL(imageUrl).pathname);

    const upload = await env.createUpload({
      file: Buffer.from(buffer)
    });

    const asset = await env.createAsset({
      fields: {
        title: { [locale]: fileName },
        description: { [locale]: imageUrl },
        file: {
          [locale]: {
            contentType,
            fileName,
            uploadFrom: {
              sys: {
                type: "Link",
                linkType: "Upload",
                id: upload.sys.id
              }
            }
          }
        }
      }
    });

    const processed = await asset.processForAllLocales();
    await processed.publish();

    return processed.sys.id;
  } catch {
    return null;
  }
}
