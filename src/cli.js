/**
 * @module cli
 * Harns — Plan-by-Default Coding Harness
 *
 * Usage:
 *   hns "<user request>"
 *   hns router "<user request>"
 *   hns resume <plan-name-or-path>
 *   hns plans
 *   hns sleep
 *   hns --help
 *
 * Source-run fallback for contributors:
 *   deno run -A src/cli.js "<user request>"
 */

import { parseArgs } from "@std/cli/parse-args";
import { COMMAND_NAMES } from "./constants.js";
import { commandRegistry } from "./cmd/registry.js";
import { printGlobalHelp } from "./shared/help-text.js";

/**
 * Main CLI entrypoint.
 */
async function main() {
    const args = Deno.args;

    const parsed = parseArgs(args, { stopEarly: true });

    const [firstPositional] = parsed._;

    // Explicit command dispatch: `cli.js <command> ...`
    if (commandRegistry[firstPositional]) {
        if (!commandRegistry[firstPositional].isCli) {
            console.error(
                `[Harns] Command '${firstPositional}' is only available inside interactive chat as /${firstPositional}.`,
            );
            Deno.exit(1);
        }
        await commandRegistry[firstPositional].execute(args.slice(1));
        return;
    }

    // Help flag: `cli.js --help` or `cli.js -h`
    if (parsed.help) {
        printGlobalHelp();
        return;
    }

    // Default command route: `cli.js "<user request>"` => router
    // this is the same as cli.js --agent router "request"
    await commandRegistry[COMMAND_NAMES.ROUTER].execute(args);
}

main().catch((err) => {
    if (err instanceof Error && err.message.includes("Mnemosyne binary not found")) {
        console.error(err.message);
    } else {
        console.error("[Harns] Fatal error:", err);
    }
    Deno.exit(1);
});
