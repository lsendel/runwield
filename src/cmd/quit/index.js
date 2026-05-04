import { stopTUI } from "../../shared/tui.js";

/**
 * @typedef {Object} CommandDependencies
 * @property {typeof stopTUI} [stopTUI]
 * @property {typeof setTimeout} [setTimeout]
 * @property {typeof Deno.exit} [exit]
 */

/**
 * @param {string[]} _argv
 * @param {import('../registry.js').CommandContext & { __testDeps?: CommandDependencies }} [options]
 */
async function runQuitCommand(_argv, options = {}) {
    const deps = /** @type {CommandDependencies} */ ((/** @type {any} */ (options)).__testDeps || {});
    const {
        stopTUI: stopTUIFn = stopTUI,
        setTimeout: setTimeoutFn = setTimeout,
        exit: exitFn = Deno.exit,
    } = deps;
    const { editor, tui } = options;

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
