import { stopTUI } from "../../shared/tui.js";

/**
 * @param {string[]} _argv
 * @param {import('../registry.js').CommandContext & { __testDeps?: { stopTUI?: typeof stopTUI, setTimeout?: typeof setTimeout, exit?: typeof Deno.exit } }} [options]
 */
async function runQuitCommand(_argv, options = {}) {
    const { editor, tui } = options;
    const deps = /** @type {{ stopTUI?: typeof stopTUI, setTimeout?: typeof setTimeout, exit?: typeof Deno.exit }} */
        ((/** @type {any} */ (options)).__testDeps || {});
    const stopTUIFn = deps.stopTUI || stopTUI;
    const setTimeoutFn = deps.setTimeout || setTimeout;
    const exitFn = deps.exit || Deno.exit;

    if (!editor || !tui) return;

    editor.setText("");
    tui.requestRender();
    setTimeoutFn(() => {
        stopTUIFn();
        setTimeoutFn(() => exitFn(0), 100);
    }, 50);

    await Promise.resolve();
}

export { runQuitCommand };
