/**
 * @module shared/clipboard
 * Utility to read images from the system clipboard.
 */

/**
 * Check if the clipboard contains an image, and if so, return it as base64.
 * Currently only implemented for macOS via AppleScript.
 *
 * @returns {Promise<{ base64: string, mimeType: string } | null>}
 */
export async function readClipboardImage() {
  if (Deno.build.os !== "darwin") {
    // Silently skip on non-macOS platforms for now
    return null;
  }

  // 1. Check if clipboard has an image
  const checkCmd = new Deno.Command("osascript", {
    args: [
      "-e",
      `try
        the clipboard as «class PNGf»
        return "image"
      on error
        return "none"
      end try`,
    ],
  });
  
  const checkRes = await checkCmd.output();
  const checkOutput = new TextDecoder().decode(checkRes.stdout).trim();
  
  if (checkOutput !== "image") {
    return null; // No image in clipboard
  }

  // 2. Extract the image to a temporary file
  const tempFile = await Deno.makeTempFile({ prefix: "harns-clipboard-", suffix: ".png" });
  
  const extractCmd = new Deno.Command("osascript", {
    args: [
      "-e",
      `set tempFile to "${tempFile}"
      set theImage to the clipboard as «class PNGf»
      set theFile to open for access POSIX file tempFile with write permission
      write theImage to theFile
      close access theFile`,
    ],
  });
  
  const extractRes = await extractCmd.output();
  if (!extractRes.success) {
    // Cleanup and return null if extraction failed
    try { await Deno.remove(tempFile); } catch {}
    return null;
  }

  // 3. Read the image and base64 encode it
  try {
    const base64Cmd = new Deno.Command("base64", { args: ["-i", tempFile] });
    const base64Res = await base64Cmd.output();
    if (base64Res.success) {
      const base64Data = new TextDecoder().decode(base64Res.stdout).replace(/\\s+/g, "");
      return {
        base64: base64Data,
        mimeType: "image/png",
      };
    }
  } catch (err) {
    // Ignore error
  } finally {
    // Cleanup
    try { await Deno.remove(tempFile); } catch {}
  }

  return null;
}
