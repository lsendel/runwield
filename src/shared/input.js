/**
 * @module shared/input
 * Small stdin helpers for interactive command prompts.
 */

/**
 * Read a single line-ish response from stdin.
 *
 * @param {number} [maxBytes=256]
 * @returns {Promise<string>}
 */
export async function readUserInput(maxBytes = 256) {
  const buf = new Uint8Array(maxBytes);
  const bytesRead = await Deno.stdin.read(buf);

  if (bytesRead === null) return "";

  return new TextDecoder()
    .decode(buf.subarray(0, bytesRead))
    .replaceAll("\0", "")
    .trim();
}
