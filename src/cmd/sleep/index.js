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
 * Handle `sleep` command.
 *
 * @param {string[]} argv
 */
export async function runSleepCommand(argv, options = {}) {
    const deps = /** @type {Record<string, unknown>} */ ((/** @type {any} */ (options)).__testDeps || {});
    const parseArgsFn = /** @type {typeof parseArgs} */ (deps.parseArgs || parseArgs);
    const printCommandHelpFn = /** @type {typeof printCommandHelp} */ (deps.printCommandHelp || printCommandHelp);
    const ensureMnemosyneBinaryFn =
        /** @type {typeof ensureMnemosyneBinary} */ (deps.ensureMnemosyneBinary || ensureMnemosyneBinary);
    const runAgentSessionFn = /** @type {typeof runAgentSession} */ (deps.runAgentSession || runAgentSession);

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
