/**
 * Output sanitization helpers ported from pi-mono behavior.
 */

import stripAnsi from "strip-ansi";

/**
 * Sanitize binary output for display/storage.
 * Removes characters that crash string-width or cause display issues:
 * - Control characters (except tab, newline, carriage return)
 * - Lone surrogates
 * - Unicode Format characters (crash string-width due to a bug)
 * - Characters with undefined code points
 *
 * @param {string} str
 * @returns {string}
 */
export function sanitizeBinaryOutput(str) {
    // Use Array.from to properly iterate over code points (not code units)
    // This handles surrogate pairs correctly and catches edge cases where
    // codePointAt() might return undefined
    return Array.from(str)
        .filter((char) => {
            // Filter out characters that cause string-width to crash
            // This includes:
            // - Unicode format characters
            // - Lone surrogates (already filtered by Array.from)
            // - Control chars except \t \n \r
            // - Characters with undefined code points

            const code = char.codePointAt(0);

            // Skip if code point is undefined (edge case with invalid strings)
            if (code === undefined) return false;

            // Allow tab, newline, carriage return
            if (code === 0x09 || code === 0x0a || code === 0x0d) return true;

            // Filter out control characters (0x00-0x1F, except 0x09, 0x0A, 0x0D)
            if (code <= 0x1f) return false;

            // Filter out Unicode format characters
            if (code >= 0xfff9 && code <= 0xfffb) return false;

            return true;
        })
        .join("");
}

/**
 * Port of pi-mono bash chunk sanitization:
 * sanitizeBinaryOutput(stripAnsi(text)).replace(/\r/g, "")
 *
 * @param {string} text
 * @returns {string}
 */
export function sanitizeBashOutputChunk(text) {
    return sanitizeBinaryOutput(stripAnsi(text)).replace(/\r/g, "");
}
