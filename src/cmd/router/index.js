/**
 * @module cmd/router
 * Router command implementation (also used as default command).
 */

import { parseArgs } from "@std/cli/parse-args";
import { printCommandHelp } from "../../shared/help-text.js";
import { startInteractiveSession } from "../../shared/chat-session.js";
import { runRouterCommandImpl } from "./router-impl.js";

/**
 * Handle router/default command.
 *
 * @param {string[]} argv
 */
export async function runRouterCommand(argv) {
  const parsed = parseArgs(argv, {
    boolean: ["help"],
    alias: { h: "help" },
    stopEarly: true,
  });

  if (parsed.help) {
    printCommandHelp("router");
    return;
  }

  const userRequest = argv.join(" ").trim();
  
  // Launch the interactive TUI session with the router as the default handler
  await startInteractiveSession(userRequest, runRouterCommandImpl);
}
