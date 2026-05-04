/**
 * @module cmd/sleep
 * Sleep command: run memory optimization/cleanup agent invocation.
 */

import { parseArgs } from "@std/cli/parse-args";
import { COMMAND_NAMES } from "../../constants.js";
import { runAgentSession } from "../../shared/session/session.js";
import { printCommandHelp } from "../help/index.js";
import { ensureMnemosyneBinary } from "../../shared/runtime-preflight.js";

/**
 * @typedef {Object} CommandDependencies
 * @property {typeof parseArgs} [parseArgs]
 * @property {typeof printCommandHelp} [printCommandHelp]
 * @property {typeof ensureMnemosyneBinary} [ensureMnemosyneBinary]
 * @property {typeof runAgentSession} [runAgentSession]
 */

/**
 * Handle `sleep` command.
 *
 * @param {string[]} argv
 * @param {{ __testDeps?: CommandDependencies }} [options]
 */
export async function runSleepCommand(argv, options = {}) {
    const deps = /** @type {CommandDependencies} */ ((/** @type {any} */ (options)).__testDeps || {});
    const {
        parseArgs: parseArgsFn = parseArgs,
        printCommandHelp: printCommandHelpFn = printCommandHelp,
        ensureMnemosyneBinary: ensureMnemosyneBinaryFn = ensureMnemosyneBinary,
        runAgentSession: runAgentSessionFn = runAgentSession,
    } = deps;

    const parsed = parseArgsFn(argv, {
        boolean: ["help"],
        alias: { h: "help" },
        stopEarly: true,
    });

    if (parsed.help) {
        printCommandHelpFn(COMMAND_NAMES.SLEEP);
        return;
    }

    await ensureMnemosyneBinaryFn();

    console.log("[Harns] Running sleep mode (memory optimization)...\n");

    // Route through the /sleep prompt template using the operator agent
    await runAgentSessionFn({
        agentName: "operator",
        userRequest: "/sleep",
    });

    console.log("\n[Harns] ✅ Sleep complete.");
}
