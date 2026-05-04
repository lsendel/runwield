/**
 * @module cmd/router
 * Router command implementation (also used as default command).
 */

import { printCommandHelp } from "../help/index.js";
import { setActiveAgent, startInteractiveSession } from "../../shared/chat-session.js";
import { CLI_BIN, COMMAND_NAMES, CWD } from "../../constants.js";
import { ensurePlansDir } from "../../plan-store.js";
import { triageReportTool } from "../../tools/triage-report.js";
import { planWrittenTool } from "../../tools/plan-written.js";
import { createUserInterviewTool } from "../../tools/user-interview.js";
import { runAgentSession } from "../../shared/session/session.js";
import { extractTriageReport } from "./triage.js";
import { askApprovalWithTasks, askPostApproval, executePlan, reviewLoop } from "../../shared/workflow/workflow.js";
import { createDirectAgentHandler } from "../../shared/direct-agent.js";
import { buildRepairPrompt } from "../command-helpers.js";

/**
 * Handle router/default command.
 *
 * @param {string[]} argv
 * @param {import('../registry.js').CommandContext & { __testDeps?: Record<string, unknown> }} [options]
 */
export async function runRouterCommand(argv, options = {}) {
    const userRequest = argv.join(" ").trim();
    const testDeps = /** @type {Record<string, unknown>} */ ((/** @type {any} */ (options)).__testDeps || {});
    const printCommandHelpFn = /** @type {(name: string) => void} */ (testDeps.printCommandHelp || printCommandHelp);
    const startInteractiveSessionFn =
        /** @type {typeof startInteractiveSession} */ (testDeps.startInteractiveSession || startInteractiveSession);

    if (userRequest === "help") {
        printCommandHelpFn(COMMAND_NAMES.ROUTER);
        return;
    }

    // Launch the interactive loop with the router as the default handler
    // The loop inside startInteractiveSession will call setActiveAgent
    await startInteractiveSessionFn(userRequest, routerCmdOnMessage, {
        sessionStartMode: options.sessionStartMode || "new",
    });
}

/**
 * @typedef RouterCmdTestDeps
 * @property {(cwd: string) => Promise<string>} [ensurePlansDir]
 * @property {typeof runAgentSession} [runAgentSession]
 * @property {typeof extractTriageReport} [extractTriageReport]
 * @property {typeof createUserInterviewTool} [createUserInterviewTool]
 * @property {typeof reviewLoop} [reviewLoop]
 * @property {typeof askPostApproval} [askPostApproval]
 * @property {typeof askApprovalWithTasks} [askApprovalWithTasks]
 * @property {typeof executePlan} [executePlan]
 * @property {typeof setActiveAgent} [setActiveAgent]
 * @property {typeof createDirectAgentHandler} [createDirectAgentHandler]
 * @property {typeof buildRepairPrompt} [buildRepairPrompt]
 * @property {typeof triageReportTool} [triageReportTool]
 * @property {typeof planWrittenTool} [planWrittenTool]
 */

/**
 * Handle router logic inside the interactive loop.
 *
 * @param {string} userRequest
 * @param {Array<{base64: string, mimeType: string}>} images
 * @param {import('../../shared/workflow/workflow.js').UiAPI} uiAPI
 * @param {import('@mariozechner/pi-coding-agent').SessionManager} [sessionManager]
 * @param {RouterCmdTestDeps} [testDeps]
 */
export async function routerCmdOnMessage(userRequest, images, uiAPI, sessionManager, testDeps = {}) {
    const ensurePlansDirFn = testDeps.ensurePlansDir || ensurePlansDir;
    const runAgentSessionFn = testDeps.runAgentSession || runAgentSession;
    const extractTriageReportFn = testDeps.extractTriageReport || extractTriageReport;
    const createUserInterviewToolFn = testDeps.createUserInterviewTool || createUserInterviewTool;
    const reviewLoopFn = testDeps.reviewLoop || reviewLoop;
    const askPostApprovalFn = testDeps.askPostApproval || askPostApproval;
    const askApprovalWithTasksFn = testDeps.askApprovalWithTasks || askApprovalWithTasks;
    const executePlanFn = testDeps.executePlan || executePlan;
    const setActiveAgentFn = testDeps.setActiveAgent || setActiveAgent;
    const createDirectAgentHandlerFn = testDeps.createDirectAgentHandler || createDirectAgentHandler;
    const buildRepairPromptFn = testDeps.buildRepairPrompt || buildRepairPrompt;
    const triageReportToolDef = testDeps.triageReportTool || triageReportTool;
    const planWrittenToolDef = testDeps.planWrittenTool || planWrittenTool;

    await ensurePlansDirFn(CWD);

    uiAPI.appendSystemMessage("=== Phase A: Router (Triage) ===");

    const routerMessages = await runAgentSessionFn({
        agentName: "router",
        customTools: [triageReportToolDef],
        userRequest,
        images,
        uiAPI,
        sessionManager,
    });

    const triage = extractTriageReportFn(routerMessages);

    if (!triage) {
        const lastAssistant = routerMessages.slice().reverse().find((m) => m.role === "assistant");
        if (lastAssistant && lastAssistant.stopReason === "error") {
            uiAPI.appendSystemMessage(
                `Router error: ${lastAssistant.errorMessage || "Unknown LLM error"}`,
                true,
            );
        } else {
            uiAPI.appendSystemMessage("ERROR: Router did not produce a triage report.", true);
        }
        return;
    }

    uiAPI.appendSystemMessage(
        `[Router] Classification: ${triage.classification}, ` +
            `Complexity: ${triage.complexity}. ` +
            `Summary: ${triage.summary}`,
    );

    if (triage.classification === "QUICK_FIX") {
        uiAPI.appendSystemMessage("QUICK_FIX detected. Handing off to Operator...");
        uiAPI.appendSystemMessage("=== Phase B: Operator (Execute) ===");

        const operatorRequest = [
            "## User Request",
            userRequest,
            "",
            "## Triage Report",
            `- Classification: ${triage.classification}`,
            `- Complexity: ${triage.complexity}`,
            `- Summary: ${triage.summary}`,
            `- Affected paths: ${triage.affectedPaths.join(", ")}`,
            "",
        ].join("\n");

        await runAgentSessionFn({
            agentName: "operator",
            userRequest: operatorRequest,
            uiAPI,
        });

        uiAPI.appendSystemMessage("✅ Operator execution complete.");

        if (sessionManager) {
            sessionManager.appendCustomMessageEntry(
                "system",
                "Quick fix executed by operator.",
                true,
                `Quick fix executed by operator. Summary:\n${triage.summary}`,
            );
        }
        setActiveAgentFn("Operator", createDirectAgentHandlerFn("operator"), uiAPI);
        return;
    }

    if (triage.classification === "FEATURE") {
        uiAPI.appendSystemMessage("FEATURE detected. Handing off to Planner...");

        const plannerRequest = [
            "## User Request",
            userRequest,
            "",
            "## Triage Report",
            `- Classification: ${triage.classification}`,
            `- Complexity: ${triage.complexity}`,
            `- Summary: ${triage.summary}`,
            `- Affected paths: ${triage.affectedPaths.join(", ")}`,
            "",
            "Based on the triage report above, explore the affected files and create a plan in the plans/ directory.",
            "Before finalizing, ask clarification questions via user_interview when requirements are ambiguous.",
            "Ask either one question or a focused batch of 1-3 questions, then incorporate the answers.",
            "Choose a descriptive, kebab-case filename (e.g., plans/add-dark-mode-toggle.md).",
        ].join("\n");

        const result = await reviewLoopFn({
            agentName: "planner",
            customTools: [planWrittenToolDef, createUserInterviewToolFn(uiAPI)],
            initialRequest: plannerRequest,
            triageMeta: triage,
            uiAPI,
        });

        if (result) {
            const action = await askPostApprovalFn(result.planName, uiAPI);
            if (action === "proceed") {
                await executePlanFn(result.planName, triage, uiAPI);
                if (sessionManager) {
                    sessionManager.appendCustomMessageEntry(
                        "system",
                        `FEATURE plan executed: plans/${result.planName}.md.`,
                        true,
                        `FEATURE plan executed: plans/${result.planName}.md. Summary: ${triage.summary}`,
                    );
                }
                setActiveAgentFn("Operator", createDirectAgentHandlerFn("operator"), uiAPI);
            } else {
                uiAPI.appendSystemMessage(
                    `Plan saved. Resume later with: ${CLI_BIN} resume ${result.planName}`,
                );
                if (sessionManager) {
                    sessionManager.appendCustomMessageEntry(
                        "system",
                        `FEATURE plan generated and saved: plans/${result.planName}.md.`,
                        true,
                        `FEATURE plan generated and saved: plans/${result.planName}.md. User decided to execute later.`,
                    );
                }
            }
        }
        return;
    }

    if (triage.classification === "PROJECT") {
        uiAPI.appendSystemMessage(
            "PROJECT detected. Handing off to Architect for targeted deep exploration + planning...",
        );
        uiAPI.appendSystemMessage(
            "=== Phase D: Architect (Targeted Explore + Plan + Review) ===",
        );

        const architectRequest = [
            "## User Request",
            userRequest,
            "",
            "## Triage Report",
            `- Classification: ${triage.classification}`,
            `- Complexity: ${triage.complexity}`,
            `- Summary: ${triage.summary}`,
            `- Affected paths: ${triage.affectedPaths.join(", ")}`,
            "",
            "Start with a targeted vertical-slice exploration from the triage input (especially affected paths).",
            "Go deep on the request-related execution path; avoid broad repo surveys.",
            "Then produce a comprehensive plan in plans/ with a descriptive kebab-case filename.",
            "Before finalizing, ask clarification questions via user_interview when needed.",
            "Ask either one question or a focused batch of 1-3 questions, then incorporate the answers.",
            "Since this is a PROJECT, include a Tasks table for multi-agent execution.",
        ].join("\n");

        const result = await reviewLoopFn({
            agentName: "architect",
            customTools: [planWrittenToolDef, createUserInterviewToolFn(uiAPI)],
            initialRequest: architectRequest,
            triageMeta: triage,
            uiAPI,
        });

        if (result) {
            const action = await askApprovalWithTasksFn(result.planName, uiAPI, result.tasks);
            if (action === "proceed") {
                const execRes = await executePlanFn(result.planName, triage, uiAPI, result.tasks);
                if (execRes && execRes.repairRequired) {
                    uiAPI.appendSystemMessage(
                        `[Harns] Execution failed due to task table error. Rerouting to Architect for repair...`,
                    );
                    // Trigger immediate repair loop
                    await reviewLoopFn({
                        agentName: "architect",
                        customTools: [planWrittenToolDef, createUserInterviewToolFn(uiAPI)],
                        initialRequest: buildRepairPromptFn(
                            result.planName,
                            execRes.error || "Unknown task table error",
                        ),
                        triageMeta: triage,
                        uiAPI,
                    });
                    // After repair, we might want to execute again, but we'll let the user decide if it comes back to approve/proceed
                } else if (sessionManager) {
                    sessionManager.appendCustomMessageEntry(
                        "system",
                        `PROJECT plan executed: plans/${result.planName}.md.`,
                        true,
                        `PROJECT plan executed: plans/${result.planName}.md. Summary: ${triage.summary}`,
                    );
                    setActiveAgentFn("Operator", createDirectAgentHandlerFn("operator"), uiAPI);
                }
            } else {
                uiAPI.appendSystemMessage(
                    `Plan saved. Resume later with: ${CLI_BIN} resume ${result.planName}`,
                );
                if (sessionManager) {
                    sessionManager.appendCustomMessageEntry(
                        "system",
                        `PROJECT plan generated and saved: plans/${result.planName}.md.`,
                        true,
                        `PROJECT plan generated and saved: plans/${result.planName}.md. User decided to execute later.`,
                    );
                }
            }
        }
    }
}
