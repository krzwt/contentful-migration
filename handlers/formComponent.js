import {
  makeLink,
  upsertCta,
  upsertFormProduct,
  parseCraftLink,
  resolveInternalUrl,
  resolveInternalTitle,
} from "../utils/contentfulHelpers.js";

const LOCALE = "en-US";
const CONTENT_TYPE = "formComponent";

/**
 * Creates or updates a `formComponent` entry that can be reused
 * across any page/component.
 *
 * Expected `formData` shape (all optional except blockId):
 * - blockId: string | number (required, used as stable key)
 * - blockName: string
 * - redirectUrl: string | object
 * - leadSourceDetails: string
 * - salesforceCampaignId: string
 * - formVariation: string
 * - version: string
 * - product: string
 * - embedSource: string
 * - selectFormEntryId: string (maps to `embedFormsCpt.fields.entryId`)
 */
export async function createOrUpdateFormComponent(env, formData = {}) {
  const blockIdValue = String(formData.blockId || "").trim();
  if (!blockIdValue) return null;

  // Dry run support
  if (!env) {
    console.log(
      `   [DRY RUN] Would upsert ${CONTENT_TYPE} for blockId: ${blockIdValue}`,
    );
    return { sys: { id: `dry-run-formComponent-${blockIdValue}` } };
  }

  let existing;
  try {
    existing = await env.getEntries({
      content_type: CONTENT_TYPE,
      "fields.blockId": blockIdValue,
      limit: 1,
    });
  } catch (err) {
    console.warn(
      `   ⚠ Error fetching existing "${CONTENT_TYPE}" for blockId=${blockIdValue}: ${err.message}`,
    );
    return null;
  }

  const fields = {
    blockId: { [LOCALE]: blockIdValue },
    blockName: {
      [LOCALE]: formData.blockName || formData.title || "Form Component",
    },
  };

  const setIfPresent = (fieldId, value) => {
    if (value === undefined || value === null || value === "") return;
    if (typeof value === "object") {
      fields[fieldId] = { [LOCALE]: JSON.stringify(value) };
    } else {
      fields[fieldId] = { [LOCALE]: String(value) };
    }
  };

  // These field IDs must match the Contentful `formComponent` schema

  // 1) Redirect URL → create/link a CTA entry (same as Craft: entry link or URL)
  if (formData.redirectUrl && env) {
    try {
      const linkInfo = parseCraftLink(formData.redirectUrl);

      // Derive URL: prefer explicit URL from JSON, otherwise resolve by linkedId (for fallback)
      let finalUrl = linkInfo.url || "";
      if (!finalUrl && linkInfo.linkedId) {
        const resolved = resolveInternalUrl(linkInfo.linkedId);
        if (resolved) finalUrl = resolved;
      }

      // Derive label: prefer explicit label, otherwise page title, otherwise empty
      let finalLabel = linkInfo.label || "";
      if (!finalLabel && linkInfo.linkedId) {
        const title = resolveInternalTitle(linkInfo.linkedId);
        if (title) finalLabel = title;
      }

      // When Craft has linkedId (e.g. "AWS Marketplace thank you"), pass it so CTA gets Page Link
      const hasDestination = linkInfo.linkedId || finalUrl;
      if (!hasDestination) {
        console.warn(
          `   ⚠ Skipping redirect CTA for formComponent ${blockIdValue}: no linkedId or URL.`,
        );
      } else {
        const ctaEntry = await upsertCta(
          env,
          `form-redirect-${blockIdValue}`,
          finalLabel,
          finalUrl,
          true,
          linkInfo.linkedId ?? null,
        );
        if (ctaEntry && ctaEntry.sys && ctaEntry.sys.id) {
          fields.redirectUrl = {
            [LOCALE]: makeLink(ctaEntry.sys.id),
          };
        }
      }
    } catch (err) {
      console.warn(
        `   ⚠ Error creating redirect CTA for formComponent ${blockIdValue}: ${err.message}`,
      );
    }
  }
  // product is a Link to formProducts (optionLabel + value), not a string
  if (formData.product != null && String(formData.product).trim() !== "") {
    try {
      const productEntry = await upsertFormProduct(env, formData.product);
      if (productEntry?.sys?.id) {
        fields.product = { [LOCALE]: makeLink(productEntry.sys.id) };
      }
    } catch (err) {
      console.warn(
        `   ⚠ Error resolving product "${formData.product}" for formComponent ${blockIdValue}: ${err.message}`,
      );
    }
  }
  setIfPresent("sfcid", formData.salesforceCampaignId);
  setIfPresent("lang", formData.lang);

  // Optional embed source marker (helps distinguish Craft vs Contentful forms).
  // This uses the existing `embedSource` field on `formComponent`.
  setIfPresent("embedSource", formData.embedSource || "contentful");

  // Optionally link to an existing embedFormsCpt entry via `selectForm`
  if (formData.selectFormEntryId) {
    try {
      const embedEntries = await env.getEntries({
        content_type: "embedFormsCpt",
        "fields.entryId": formData.selectFormEntryId,
        limit: 1,
      });

      if (embedEntries.items.length > 0) {
        const embedEntry = embedEntries.items[0];
        fields.selectForm = {
          [LOCALE]: makeLink(embedEntry.sys.id),
        };
      } else {
        console.warn(
          `   ⚠ embedFormsCpt with entryId="${formData.selectFormEntryId}" not found. Leaving selectForm empty.`,
        );
      }
    } catch (err) {
      console.warn(
        `   ⚠ Error looking up embedFormsCpt "${formData.selectFormEntryId}": ${err.message}`,
      );
    }
  }

  let entry;
  if (existing.items.length) {
    entry = existing.items[0];
    console.log(`🔄 Updating existing ${CONTENT_TYPE}:`, entry.sys.id);
    entry.fields = {
      ...entry.fields,
      ...fields,
    };
    entry = await entry.update();
    entry = await entry.publish();
  } else {
    console.log(`✨ Creating new ${CONTENT_TYPE}`);
    entry = await env.createEntry(CONTENT_TYPE, { fields });
    entry = await entry.publish();
  }

  return entry;
}

