/**
 * @module cmd/export
 * Export current interactive session to HTML (default) or JSONL.
 */

import { join } from "@std/path";
import {
    exportRootSessionToHtml as exportRootSessionToHtmlFn,
    exportRootSessionToJsonl as exportRootSessionToJsonlFn,
} from "../../shared/session/root-session.js";

/**
 * @param {string} value
 * @returns {string}
 */
function sanitizeFilenameSegment(value) {
    return value.replace(/[\\/:*?"<>|]/g, "-");
}

/**
 * @param {string} sessionStartIso
 * @returns {string}
 */
function buildDefaultExportPath(sessionStartIso) {
    const safeIso = sanitizeFilenameSegment(sessionStartIso).replace(/\.\d{3}Z$/, "");
    return join(Deno.cwd(), `session-${safeIso}.html`);
}

/**
 * @typedef {Object} CommandDependencies
 * @property {typeof exportRootSessionToHtmlFn} [exportRootSessionToHtml]
 * @property {typeof exportRootSessionToJsonlFn} [exportRootSessionToJsonl]
 */

/**
 * Handle `/export` command (slash-only).
 *
 * @param {string[]} argv
 * @param {import('../registry.js').CommandContext & { __testDeps?: CommandDependencies }} [options]
 */
export async function runExportCommand(argv, options = {}) {
    const deps = /** @type {CommandDependencies} */ ((/** @type {any} */ (options)).__testDeps || {});
    const {
        exportRootSessionToHtml: exportRootSessionToHtmlDep,
        exportRootSessionToJsonl: exportRootSessionToJsonlDep,
    } = deps;

    const exportRootSessionToHtml = exportRootSessionToHtmlDep || exportRootSessionToHtmlFn;
    const exportRootSessionToJsonl = exportRootSessionToJsonlDep || exportRootSessionToJsonlFn;

    const { uiAPI, editor, sessionManager, sessionStartedAt } = options;
    if (!uiAPI || !editor || !sessionManager) {
        return;
    }

    const requestedPath = argv.join(" ").trim();

    const fallbackIso = sessionStartedAt || new Date().toISOString();
    const outputPath = requestedPath || buildDefaultExportPath(fallbackIso);

    try {
        if (outputPath.toLowerCase().endsWith(".jsonl")) {
            const filePath = exportRootSessionToJsonl(sessionManager, outputPath);
            uiAPI.appendSystemMessage(`Session exported to: ${filePath}`);
        } else {
            const filePath = await exportRootSessionToHtml(sessionManager, outputPath);
            uiAPI.appendSystemMessage(`Session exported to: ${filePath}`);
        }
    } catch (error) {
        uiAPI.appendSystemMessage(
            `Failed to export session: ${error instanceof Error ? error.message : "Unknown error"}`,
            true,
        );
    } finally {
        editor.setText("");
        editor.disableSubmit = false;
    }
}
