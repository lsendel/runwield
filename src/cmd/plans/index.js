/**
 * @module cmd/plans
 * List saved plans.
 */

import { parseArgs } from "@std/cli/parse-args";
import { CWD } from "../../constants.js";
import { listPlans } from "../../plan-store.js";
import { printCommandHelp } from "../help/index.js";

/**
 * @typedef {Object} CommandDependencies
 * @property {typeof parseArgs} [parseArgs]
 * @property {typeof listPlans} [listPlans]
 * @property {typeof printCommandHelp} [printCommandHelp]
 */

/**
 * Handle `plans` command.
 *
 * @param {string[]} argv
 * @param {import('../registry.js').CommandContext & { __testDeps?: { parseArgs?: typeof parseArgs, listPlans?: typeof listPlans, printCommandHelp?: typeof printCommandHelp }}} [options]
 */
export async function runPlansCommand(argv, options = {}) {
    const deps = /** @type {CommandDependencies} */ options.__testDeps || {};
    const {
        parseArgs: parseArgsFn = parseArgs,
        listPlans: listPlansFn = listPlans,
        printCommandHelp: printCommandHelpFn = printCommandHelp,
    } = deps;

    const parsed = parseArgsFn(argv, {
        boolean: ["help"],
        alias: { h: "help" },
    });

    if (parsed.help) {
        printCommandHelpFn("plans");
        return;
    }

    const plans = await listPlansFn(CWD);
    if (plans.length === 0) {
        console.log("[Harns] No saved plans found.");
        return;
    }

    console.log("\n[Harns] Saved plans:\n");
    for (const p of plans) {
        console.log(`  ${p.name}`);
        console.log(
            `    Status: ${p.attrs.status} | Classification: ${p.attrs.classification} | Complexity: ${p.attrs.complexity}`,
        );
        console.log(`    Summary: ${p.attrs.summary || "(none)"}`);
        console.log(`    Created: ${p.attrs.createdAt}`);
        console.log();
    }
}
