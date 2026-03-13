# Asset URL files (GraphQL result)

Videos (and other files) that live on **assets.beyondtrust.com** (S3) are **not uploaded to Contentful**. The migration uses their **direct URL** in the Contentful `asset` wrapper’s `videoUrl` field.

## Where to put the GraphQL result

1. **Option A – Dedicated file (recommended for microsite videos)**  
   Paste your Craft GraphQL query result into:

   **`data/standalone-microsite-asset-urls.json`**

   This file is already wired in `index.js` and will be loaded with the other asset metadata.

2. **Option B – Add to main assets**  
   You can also add the same asset objects into **`data/assets.json`** inside the existing `data.assets` array.

## Expected JSON format

The migration expects the same shape as Craft GraphQL `assets`:

```json
{
  "data": {
    "assets": [
      {
        "id": 1664593,
        "title": "Video title",
        "filename": "video.mp4",
        "url": "https://assets.beyondtrust.com/...",
        "mimeType": "video/mp4",
        "width": null,
        "height": null,
        "size": 12345678
      }
    ]
  }
}
```

- **`id`** – Craft asset ID (number or string).
- **`url`** – Full URL (must include `assets.beyondtrust.com` for “no upload” to apply).
- **`mimeType`** – e.g. `video/mp4`. For videos, the migration will use this URL in `videoUrl` and skip uploading to Contentful.

After saving the file, run the migration as usual; videos with these URLs will use the direct link instead of being uploaded.

---

## Video thumbnails (S3 direct URL)

Thumbnails for these videos are **not uploaded** to Contentful. They follow a fixed URL convention on the same S3 bucket.

### URL convention

From a video URL like:

- `https://assets.beyondtrust.com/videoUploads/01_2024_BT_WorldTour_MIAMI_CEOAddress_JanineSeebeck.mp4`

the thumbnail URL is:

- `https://assets.beyondtrust.com/videoThumbnails/01_2024_BT_WorldTour_MIAMI_CEOAddress_JanineSeebeck/01_2024_BT_WorldTour_MIAMI_CEOAddress_JanineSeebeck.0000002.jpg`

Pattern: **`{origin}/videoThumbnails/{filenameWithoutExtension}/{filenameWithoutExtension}.0000002.jpg`**

### In the migration

- The migration derives this thumbnail URL when setting `videoUrl` on an asset wrapper and, if the Asset content type has a **"Video Thumbnail URL"** (Symbol) field, it will set it. The migration expects the field **API ID** to be **`videoThumbnailUrl`** (Contentful’s default for that name).
- If the Asset content type does **not** have that field, the migration still succeeds (it retries without it).

### In the frontend

You can either:

1. **Use the stored field**  
   If you add a Symbol field **"Video Thumbnail URL"** (API ID: **`videoThumbnailUrl`**) to the **Asset** content type in Contentful, the migration will populate it and the frontend can use `asset.videoThumbnailUrl` for the poster/thumbnail image.

2. **Derive the URL from `videoUrl`**  
   Use the same convention in your app so you don’t need a separate field:

   - Take `videoUrl` (e.g. `https://assets.beyondtrust.com/videoUploads/MyVideo.mp4`).
   - Base name = filename without extension → `MyVideo`.
   - Thumbnail = `https://assets.beyondtrust.com/videoThumbnails/MyVideo/MyVideo.0000002.jpg`.

   A helper is available in the repo: **`utils/videoThumbnailUrl.js`** → `getVideoThumbnailUrl(videoUrl)`. You can copy that logic into your frontend or call it from a shared package.
