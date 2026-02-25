/**
 * Preserves order of keys from a raw JSON segment by finding their character positions.
 * This is necessary because JS sorts numeric-like keys numerically.
 * 
 * @param {string} rawSegment - The raw string segment where keys appear
 * @param {object} obj - The parsed object whose keys need ordering
 * @returns {string[]} - The keys in the order they appear in the raw segment
 */
export function getOrderedKeys(rawSegment, obj) {
    if (!rawSegment) return Object.keys(obj);

    const keys = Object.keys(obj);
    if (keys.length <= 1) return keys;

    return [...keys].sort((a, b) => {
        // Find property definition: "key":
        // We look for the key wrapped in quotes followed by a colon
        const posA = rawSegment.indexOf(`"${a}":`);
        const posB = rawSegment.indexOf(`"${b}":`);

        // If a key isn't found (shouldn't happen with correct segments), 
        // keep it at the end.
        if (posA === -1 && posB === -1) return 0;
        if (posA === -1) return 1;
        if (posB === -1) return -1;

        return posA - posB;
    });
}
