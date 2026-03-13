/**
 * Build direct thumbnail URL for S3-hosted videos (assets.beyondtrust.com).
 * Convention: videoUploads/FileName.mp4 → videoThumbnails/FileName/FileName.0000002.jpg
 *
 * Use in migration (asset wrapper) and/or frontend to show video thumbnails without
 * uploading them to Contentful.
 *
 * @param {string} videoUrl - Full video URL (e.g. https://assets.beyondtrust.com/videoUploads/MyVideo.mp4)
 * @param {string} [frame] - Frame suffix (default "0000002" for .0000002.jpg)
 * @returns {string|null} Thumbnail URL or null if not an assets.beyondtrust.com video URL
 */
export function getVideoThumbnailUrl(videoUrl, frame = "0000002") {
  if (!videoUrl || typeof videoUrl !== "string") return null;
  const trimmed = videoUrl.trim();
  if (!trimmed) return null;

  // Only handle assets.beyondtrust.com (or assets-uat.btdevops.io) video paths
  const match = trimmed.match(
    /^(https?:\/\/[^/]+)\/(?:videoUploads|videos?)\/([^?#]+\.(?:mp4|webm|mov))$/i
  );
  if (!match) return null;

  const base = match[1]; // e.g. https://assets.beyondtrust.com
  const filename = match[2];   // e.g. 01_2024_BT_WorldTour_MIAMI_CEOAddress_JanineSeebeck.mp4
  const basename = filename.replace(/\.[^.]+$/, ""); // strip extension

  // Use same origin as video (prod vs UAT); frontend can normalize if needed
  const origin = base.startsWith("http") ? base : `https://${base}`;
  return `${origin}/videoThumbnails/${basename}/${basename}.${frame}.jpg`;
}
