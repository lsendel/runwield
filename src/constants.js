/**
 * @module constants
 * Shared constants for Harness CLI orchestration.
 */

import { dirname, fromFileUrl, join } from "@std/path";

/** Name of the installed CLI binary shown in user-facing docs/help. */
export const CLI_BIN = "har";

/** Fallback source-run invocation used in contributor docs and local dev. */
export const DEV_CLI_RUN = "deno run -A src/cli.js";

/** Current project root used by all command handlers and agent sessions. */
export const CWD = Deno.cwd();

/** Harness source root path (works for source runs and compiled binaries). */
const SRC_DIR = dirname(fromFileUrl(import.meta.url));

/** Directory containing bundled default agent prompt markdown files. */
export const AGENTS_DIR = join(SRC_DIR, "..", ".pi", "agents");

/**
 * Core system guidance prepended to every agent-specific prompt.
 * Keeps cross-agent behavior aligned with Harness expectations.
 */
export const CORE_SYSTEM_PROMPT = [
  "You are part of the Harness system — a plan-by-default coding harness.",
  "Always be concise, thorough, and precise in your analysis.",
  "When you use tools, explain briefly what you're looking for.",
].join("\n");

/** Allowed triage classification values emitted by the router. */
export const CLASSIFICATIONS = ["QUICK_FIX", "FEATURE", "PROJECT"];

/** Allowed complexity values emitted by triage. */
export const COMPLEXITIES = ["LOW", "MEDIUM", "HIGH"];

/** Directory name where plan markdown files are stored. */
export const PLANS_DIR_NAME = "plans";

/** Known CLI command names. */
export const COMMAND_NAMES = Object.freeze({
  ROUTER: "router",
  RESUME: "resume",
  PLANS: "plans",
  HELP: "help",
});

/**
 * Reusable tool bundles for agent sessions.
 * Keeping these centralized avoids drift between commands.
 */
export const TOOLSETS = Object.freeze({
  ROUTER: ["read", "bash"],
  OPERATOR: ["read", "edit", "write", "bash"],
  PLANNING: ["read", "edit", "write", "bash"],
  ENGINEER: ["read", "edit", "write", "bash"],
  DOC_WRITER: ["read", "write", "bash"],
});
