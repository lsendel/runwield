/**
 * @module cmd/help
 * Global and command-specific help command.
 */

import { parseArgs } from "@std/cli/parse-args";
import { CLI_BIN, DEV_CLI_RUN } from "../../constants.js";
import { getCliCommandDefinitions, getCommandDefinition } from "../registry.js";

/**
 * Print global CLI usage/help text.
 */
export function printGlobalHelp() {
    console.log("Harns — Plan-by-Default Coding Harness\n");
    console.log("Usage:");
    console.log(`  ${CLI_BIN} \"<user request>\"`);
    console.log(`  ${CLI_BIN} --continue \"<optional message>\"`);
    console.log(`  ${CLI_BIN} <command> [args]\n`);

    console.log("Commands:");
    for (const command of getCliCommandDefinitions()) {
        console.log(`  ${command.name.padEnd(8)} ${command.summary}`);
    }

    console.log("\nGlobal flags:");
    console.log("  --continue, -c   Continue newest saved session (default startup route only)");

    console.log("\nHelp:");
    console.log(`  ${CLI_BIN} --help`);
    console.log(`  ${CLI_BIN} help <command>`);
    console.log(`\nDeveloper fallback: ${DEV_CLI_RUN} --help`);
}

/**
 * Print usage/help text for a specific command.
 *
 * @param {string} commandName
 * @returns {boolean}
 */
export function printCommandHelp(commandName) {
    const command = getCommandDefinition(commandName);
    if (!command) return false;

    console.log(`Usage (${command.name}):`);
    for (const line of command.usage) {
        console.log(`  ${line}`);
    }

    if (command.notes && command.notes.length > 0) {
        console.log("\nNotes:");
        for (const note of command.notes) {
            console.log(`  - ${note}`);
        }
    }

    return true;
}

/**
 * Run help command
 *
 * @param {string[]} argv
 */
export async function runHelpCommand(argv) {
    await Promise.resolve();

    const parsed = parseArgs(argv, {
        boolean: ["help"],
        alias: { h: "help" },
    });

    const [commandName] = parsed._.map(String);

    const found = printCommandHelp(commandName);
    if (!found && commandName) {
        console.error(`[Harns] Unknown command for help: ${commandName}`);
        console.log();
        Deno.exit(1);
    }

    !commandName && printGlobalHelp();
}
