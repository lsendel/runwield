/**
 * @module shared/runtime-preflight
 * Shared startup/execution preflight checks.
 */

const MNEMOSYNE_INSTALL_URL = "https://github.com/gandazgul/mnemosyne#quick-start";

let mnemosyneChecked = false;
let mnemosyneAvailable = false;

/**
 * @returns {Promise<boolean>}
 */
async function hasMnemosyneBinary() {
    try {
        const proc = new Deno.Command("mnemosyne", {
            args: ["--help"],
            stdout: "null",
            stderr: "null",
        }).spawn();

        const status = await proc.status;
        return status.success;
    } catch {
        return false;
    }
}

/**
 * Ensure Mnemosyne is available in PATH.
 *
 * This is a hard requirement for interactive/agent execution flows.
 *
 * @returns {Promise<void>}
 */
export async function ensureMnemosyneBinary() {
    if (!mnemosyneChecked) {
        mnemosyneAvailable = await hasMnemosyneBinary();
        mnemosyneChecked = true;
    }

    if (mnemosyneAvailable) return;

    throw new Error(
        [
            "[Harns] Mnemosyne binary not found in PATH.",
            `Install it: ${MNEMOSYNE_INSTALL_URL}`,
        ].join("\n"),
    );
}
