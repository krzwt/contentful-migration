const PRODUCTION_ASSETS_HOST = "https://assets.beyondtrust.com";

/**
 * Replace assets-uat.btdevops.io with assets.beyondtrust.com in any asset URL.
 * Use for both Video URL and Video Thumbnail URL so Contentful stores production URLs.
 */
export function normalizeAssetsDomain(url) {
  if (!url || typeof url !== "string") return url;
  return url
    .replace(/https:\/\/assets-uat\.btdevops\.io/gi, PRODUCTION_ASSETS_HOST)
    .replace(/http:\/\/assets-uat\.btdevops\.io/gi, "http://assets.beyondtrust.com");
}

/**
 * Build direct thumbnail URL for S3-hosted videos (assets.beyondtrust.com).
 * Convention: videoUploads/FileName.mp4 → videoThumbnails/FileName/FileName.0000002.jpg
 * Output always uses assets.beyondtrust.com (UAT domain is normalized).
 *
 * @param {string} videoUrl - Full video URL (e.g. https://assets.beyondtrust.com/videoUploads/MyVideo.mp4)
 * @param {string} [frame] - Frame suffix (default "0000002" for .0000002.jpg)
 * @returns {string|null} Thumbnail URL or null if not an assets video URL
 */
export function getVideoThumbnailUrl(videoUrl, frame = "0000002") {
  if (!videoUrl || typeof videoUrl !== "string") return null;
  const trimmed = videoUrl.trim();
  if (!trimmed) return null;

  // Handle assets.beyondtrust.com or assets-uat.btdevops.io video paths
  const match = trimmed.match(
    /^(https?:\/\/[^/]+)\/(?:videoUploads|videos?)\/([^?#]+\.(?:mp4|webm|mov))$/i
  );
  if (!match) return null;

  const filename = match[2];
  const basename = filename.replace(/\.[^.]+$/, "");

  // Always use production domain for thumbnail URL
  const origin = PRODUCTION_ASSETS_HOST;
  return `${origin}/videoThumbnails/${basename}/${basename}.${frame}.jpg`;
}
