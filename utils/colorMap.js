/**
 * Maps Craft CMS background color values to Contentful values.
 *
 * Craft:      White | Dark Blue | Orange
 * Contentful: White | Blue      | Orange
 */
const COLOR_MAP = {
    "darkBlue": "Blue",
    "Dark Blue": "Blue",
    "dark blue": "Blue",
    "white": "White",
    "White": "White",
    "orange": "Orange",
    "Orange": "Orange"
};

export function mapBackgroundColor(craftColor) {
    if (!craftColor) return "Blue"; // default
    return COLOR_MAP[craftColor] || craftColor;
}
