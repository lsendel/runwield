/**
 * @module cli
 * Harness — Plan-by-Default Coding Harness
 *
 * Usage:
 *   deno run -A src/cli.js "<user request>"
 *   deno run -A src/cli.js resume <plan-name>
 *   deno run -A src/cli.js resume path/to/plan.md
 *
 * Flow:
 *   QUICK_FIX:  Router → Operator
 *   FEATURE:    Router → Planner → [Plannotator UI loop] → Engineer
 *   PROJECT:    Router → Architect (with targeted vertical-slice exploration) → [Plannotator UI loop] → Engineer/Tester/DocWriter
 */

import { createAgentSession, DefaultResourceLoader, SessionManager, } from "@mariozechner/pi-coding-agent";
import { triageReportTool } from "./tools/triage-report.js";
import { submitPlanForReview } from "./tools/submit-plan.js";
import { extractYaml, test as hasFrontMatter } from "@std/front-matter";
import { join } from "@std/path";
import { loadPlan, listPlans, resolvePlan, ensurePlansDir } from "./plan-store.js";

// ─── Constants ────────────────────────────────────────────────────────

const CWD = Deno.cwd();
const AGENTS_DIR = join(CWD, ".pi", "agents");

const CORE_SYSTEM_PROMPT = [
    "You are part of the Harness system — a plan-by-default coding harness.",
    "Always be concise, thorough, and precise in your analysis.",
    "When you use tools, explain briefly what you're looking for.",
].join("\n");

// ─── Agent Loading ────────────────────────────────────────────────────

/**
 * @typedef {Object} AgentDef
 * @property {string} name - Agent name (from frontmatter or filename)
 * @property {string} model - Model identifier (from frontmatter)
 * @property {string} systemPrompt - Core prompt + agent-specific prompt
 */

/**
 * Load an agent definition from a markdown file.
 * Parses YAML frontmatter for metadata; uses the body as the agent prompt.
 * Prepends the core Harness system prompt.
 *
 * @param {string} agentName - Filename without extension (e.g., "router")
 * @returns {Promise<AgentDef>} The parsed agent definition
 */
async function loadAgent(agentName) {
    const filePath = join(AGENTS_DIR, `${agentName}.md`);
    const raw = await Deno.readTextFile(filePath);

    if (!hasFrontMatter(raw)) {
        throw new Error(`Agent file ${filePath} has no frontmatter`);
    }

    const { attrs, body } = extractYaml(raw);
    const name = attrs.name || agentName;
    const model = attrs.model || "claude-sonnet-4-20250514";

    /** @type {string} */
    const systemPrompt = CORE_SYSTEM_PROMPT + "\n\n" + body.trim();

    return { name, model, systemPrompt };
}

// ─── Session Helpers ──────────────────────────────────────────────────

/**
 * Create and run an agent session, returning after the agent goes idle.
 * Logs streaming events to the console.
 *
 * @param {Object} opts
 * @param {string} opts.agentName - Which agent .md to load
 * @param {string[]} opts.toolNames - Built-in tool names to enable
 * @param {import('@mariozechner/pi-coding-agent').ToolDefinition[]} [opts.customTools] - Custom tools
 * @param {string} opts.prompt - The user message to send
 * @returns {Promise<import('@mariozechner/pi-agent-core').AgentMessage[]>} Conversation messages
 */
async function runSession({ agentName, toolNames, customTools, prompt }) {
    const agentDef = await loadAgent(agentName);
    console.log(`\n[Harness] Loading agent: ${agentDef.name} (model: ${agentDef.model})`);

    const loader = new DefaultResourceLoader({
        cwd: CWD,
        agentDir: AGENTS_DIR,
        systemPromptOverride: () => agentDef.systemPrompt,
    });
    await loader.reload();

    const { session } = await createAgentSession({
        cwd: CWD,
        tools: [...toolNames, ...(customTools || []).map((t) => t.name)],
        customTools: customTools || [],
        resourceLoader: loader,
        sessionManager: SessionManager.inMemory(),
    });

    // Log streaming events
    session.subscribe((event) => {
        switch (event.type) {
            case "message_update":
                if (event.assistantMessageEvent.type === "text_delta") {
                    process.stdout.write(event.assistantMessageEvent.delta);
                }
                break;
            case "tool_execution_start":
                console.log(`\n  [Tool] ${event.toolName}${event.toolName === "bash" ? `\n    Command: ${event.args?.command || "N/A"}` : ""}`);
                break;
            case "tool_execution_end":
                console.log(
                    `  [Tool] ${event.toolName} — ${event.isError ? "error" : "ok"}`,
                );
                break;
        }
    });

    // Send the prompt and wait for the agent to finish
    await session.prompt(prompt);
    await session.agent.waitForIdle();

    // Return the full conversation history
    return session.agent.state.messages;
}

// ─── Triage Extraction ────────────────────────────────────────────────

const CLASSIFICATIONS = ["QUICK_FIX", "FEATURE", "PROJECT"];
const COMPLEXITIES = ["LOW", "MEDIUM", "HIGH"];

/**
 * Extract the triage report from the Router's conversation messages.
 *
 * Strategy 1: Look for a toolResult from the `triage_report` tool.
 * Strategy 2 (fallback): Parse the classification from the last assistant
 *   message's text content.
 *
 * @param {import('@mariozechner/pi-agent-core').AgentMessage[]} messages
 * @returns {{ classification: string, complexity: string, summary: string, affectedPaths: string[] } | null}
 */
function extractTriageReport(messages) {
    // Strategy 1: actual tool call result
    for (const msg of messages) {
        if (
            "role" in msg &&
            msg.role === "toolResult" &&
            "toolName" in msg &&
            msg.toolName === "triage_report"
        ) {
            // @ts-ignore — details is set by our tool's execute()
            return msg.details || null;
        }
    }

    // Strategy 2: parse from assistant text
    const assistantMsgs = messages.filter(
        (m) => "role" in m && m.role === "assistant",
    );
    for (let i = assistantMsgs.length - 1; i >= 0; i--) {
        const msg = assistantMsgs[i];
        if (!("content" in msg) || !Array.isArray(msg.content)) continue;
        for (const block of msg.content) {
            if (block.type !== "text") continue;
            const parsed = parseTriageFromText(block.text);
            if (parsed) return parsed;
        }
    }

    return null;
}

/**
 * Attempt to extract a triage report from freeform text.
 *
 * @param {string} text
 * @returns {{ classification: string, complexity: string, summary: string, affectedPaths: string[] } | null}
 */
function parseTriageFromText(text) {
    const classMatch = text.match(
        /classification[:\s]+(?:"?)?(QUICK_FIX|FEATURE|PROJECT)(?:"?)?/i,
    );
    if (!classMatch) return null;
    const classification = classMatch[1].toUpperCase();
    if (!CLASSIFICATIONS.includes(classification)) return null;

    const complexMatch = text.match(
        /complexity[:\s]+(?:"?)?(LOW|MEDIUM|HIGH)(?:"?)?/i,
    );
    const complexity = complexMatch ? complexMatch[1].toUpperCase() : "MEDIUM";
    if (!COMPLEXITIES.includes(complexity)) return null;

    let summary = "";
    const summaryQuoted = text.match(/summary[:\s]+"([^"]+)"/s);
    if (summaryQuoted) {
        summary = summaryQuoted[1];
    } else {
        const summaryUnquoted = text.match(/summary[:\s]+(.+)/i);
        if (summaryUnquoted) summary = summaryUnquoted[1].trim();
    }

    /** @type {string[]} */
    let affectedPaths = [];
    const jsonPaths = text.match(/affectedPaths[:\s]+(\[[^\]]*])/s);
    if (jsonPaths) {
        try {
            const parsed = JSON.parse(jsonPaths[1]);
            if (Array.isArray(parsed)) affectedPaths = parsed.map(String);
        } catch {
            // not valid JSON, ignore
        }
    }
    if (affectedPaths.length === 0) {
        const yamlBlock = text.match(
            /affectedPaths[:\s]*\n((?:\s+-\s+.+\n?)*)/,
        );
        if (yamlBlock) {
            affectedPaths = [...yamlBlock[1].matchAll(/-\s+(.+)/g)].map(
                (m) => m[1].trim(),
            );
        }
    }

    return { classification, complexity, summary, affectedPaths };
}

// ─── Plan Discovery ───────────────────────────────────────────────────

/**
 * After a planner/architect session, find the plan file that was created.
 * Looks in the `plans/` directory for the most recently modified .md file.
 *
 * @returns {Promise<{ name: string, path: string } | null>}
 */
async function findLatestPlan() {
    const plansDir = join(CWD, "plans");
    let latest = null;
    let latestMtime = 0;

    try {
        for await (const entry of Deno.readDir(plansDir)) {
            if (!entry.isFile || !entry.name.endsWith(".md")) continue;
            const filePath = join(plansDir, entry.name);
            const stat = await Deno.stat(filePath);
            if (stat.mtime && stat.mtime.getTime() > latestMtime) {
                latestMtime = stat.mtime.getTime();
                latest = {
                    name: entry.name.replace(/\.md$/, ""),
                    path: filePath,
                };
            }
        }
    } catch {
        // plans dir doesn't exist
    }

    return latest;
}

// ─── Review Loop ──────────────────────────────────────────────────────

/**
 * Run the Plannotator review loop: submit plan, handle denial feedback,
 * re-run the planning agent, repeat until approved.
 *
 * @param {Object} opts
 * @param {string} opts.agentName - "planner" or "architect"
 * @param {string[]} opts.toolNames - Tools for the planning agent
 * @param {string} opts.initialPrompt - The first prompt for the agent
 * @param {Partial<import('./plan-store.js').PlanFrontMatter>} opts.triageMeta - Triage metadata for front matter
 * @param {number} [opts.maxRevisions=5] - Max revision rounds before giving up
 * @returns {Promise<{ planName: string, planPath: string, approved: true } | null>}
 */
async function reviewLoop({ agentName, toolNames, initialPrompt, triageMeta, maxRevisions = 5 }) {
    let currentPrompt = initialPrompt;
    let revision = 0;

    while (revision < maxRevisions) {
        // Run the planning agent
        if (revision === 0) {
            console.log(`\n[Harness] === Running ${agentName} ===\n`);
        } else {
            console.log(`\n[Harness] === Revising plan (attempt ${revision + 1}/${maxRevisions}) ===\n`);
        }

        await runSession({
            agentName,
            toolNames,
            prompt: currentPrompt,
        });

        // Find the plan that was just created
        const planInfo = await findLatestPlan();
        if (!planInfo) {
            console.error("\n[Harness] ERROR: Agent did not create a plan file in plans/");
            return null;
        }

        console.log(`\n[Harness] Plan created: plans/${planInfo.name}.md`);

        // Submit for review
        const result = await submitPlanForReview({
            cwd: CWD,
            planName: planInfo.name,
            planPath: planInfo.path,
            triageMeta,
        });

        if (result.approved) {
            return {
                planName: planInfo.name,
                planPath: planInfo.path,
                approved: true,
            };
        }

        // Denied — feed feedback back to the agent
        revision++;
        console.log(`\n[Harness] Plan denied. Feeding feedback back to ${agentName}...`);

        currentPrompt = [
            `## Previous Plan Feedback (Round ${revision})`,
            ``,
            `Your plan was denied. Here is the structured feedback from the user:`,
            ``,
            result.feedback || "(no specific feedback provided)",
            ``,
            `Please revise your plan in plans/${planInfo.name}.md based on this feedback.`,
            `Use the \`edit\` tool to make targeted revisions — do NOT rewrite the entire plan.`,
            `Address each piece of feedback specifically.`,
        ].join("\n");
    }

    console.error(`\n[Harness] Max revisions (${maxRevisions}) reached. Plan not approved.`);
    return null;
}

// ─── Post-Approval Prompt ─────────────────────────────────────────────

/**
 * After a plan is approved, ask the user what to do next.
 *
 * @param {string} planName
 * @returns {Promise<"proceed" | "save">}
 */
async function askPostApproval(planName) {
    console.log(`\n[Harness] Plan "${planName}" approved!`);
    console.log(`What would you like to do?`);
    console.log(`  1) Proceed with execution`);
    console.log(`  2) Save for later`);

    const buf = new Uint8Array(256);
    await Deno.stdin.read(buf);
    const answer = new TextDecoder().decode(buf).trim();

    if (answer === "1" || answer.toLowerCase() === "proceed" || answer.toLowerCase() === "p") {
        return "proceed";
    }
    return "save";
}

// ─── Task Extraction ──────────────────────────────────────────────────

/**
 * Extract tasks from a PROJECT plan's "Tasks" section.
 * Returns an array of { task, assignee, dependencies, description }.
 *
 * @param {string} planContent
 * @returns {Array<{ task: number, assignee: string, dependencies: string, description: string }>}
 */
function extractTasks(planContent) {
    const tasks = /** @type {Array<{ task: number, assignee: string, dependencies: string, description: string }>} */ ([]);
    const taskSection = planContent.match(/### Tasks\s*\n([\s\S]*?)(?=\n###|\n##|$)/);

    if (!taskSection) return tasks;

    // Parse markdown table rows
    const rows = taskSection[1].matchAll(/\|\s*(\d+)\s*\|\s*(\w[\w-]*)\s*\|\s*([^|]*)\s*\|\s*([^|]*)\s*\|/g);
    for (const match of rows) {
        tasks.push({
            task: parseInt(match[1]),
            assignee: match[2].trim(),
            dependencies: match[3].trim(),
            description: match[4].trim(),
        });
    }

    return tasks;
}

// ─── Resume Command ───────────────────────────────────────────────────

/**
 * Handle the `resume` subcommand. Loads a saved plan and lets the user
 * continue from where they left off.
 *
 * @param {string} planArg - Plan name or path
 */
async function handleResume(planArg) {
    console.log(`[Harness] Resuming plan: ${planArg}`);

    const plan = await resolvePlan(CWD, planArg);
    console.log(`[Harness] Plan loaded: ${plan.planName}`);
    console.log(`[Harness] Classification: ${plan.attrs.classification}, Status: ${plan.attrs.status}`);

    // If already approved, ask what to do
    if (plan.attrs.status === "approved") {
        console.log(`\n[Harness] This plan has already been approved.`);
        console.log(`What would you like to do?`);
        console.log(`  1) Proceed with execution`);
        console.log(`  2) Re-open for review (edit/annotate)`);
        console.log(`  3) View plan details`);

        const buf = new Uint8Array(256);
        await Deno.stdin.read(buf);
        const answer = new TextDecoder().decode(buf).trim();

        if (answer === "1" || answer.toLowerCase() === "proceed" || answer.toLowerCase() === "p") {
            await executePlan(plan.planName, plan.attrs);
            return;
        }

        if (answer === "2" || answer.toLowerCase() === "review" || answer.toLowerCase() === "r") {
            const result = await submitPlanForReview({
                cwd: CWD,
                planName: plan.planName,
                planPath: plan.path,
                triageMeta: plan.attrs,
            });

            if (result.approved) {
                const action = await askPostApproval(plan.planName);
                if (action === "proceed") {
                    await executePlan(plan.planName, plan.attrs);
                } else {
                    console.log(`\n[Harness] Plan saved. Resume later with: deno run -A src/cli.js resume ${plan.planName}`);
                }
            } else {
                console.log(`\n[Harness] Plan denied. To continue the revision loop, run:`);
                console.log(`  deno run -A src/cli.js resume ${plan.planName}`);
            }
            return;
        }

        // View details
        console.log(`\n${plan.body}`);
        return;
    }

    // If in draft/denied/in_review, re-open the review loop
    const triageMeta = plan.attrs;
    const agentName = triageMeta.classification === "PROJECT" ? "architect" : "planner";
    const revisionPrompt = [
        `## Resuming Plan: ${plan.planName}`,
        ``,
        `This plan was previously saved with status: ${plan.attrs.status}.`,
        `Continue working on it. The plan is at plans/${plan.planName}.md.`,
        ``,
        `## Triage Report`,
        `- Classification: ${triageMeta.classification}`,
        `- Complexity: ${triageMeta.complexity}`,
        `- Summary: ${triageMeta.summary}`,
        `- Affected paths: ${(triageMeta.affectedPaths || []).join(", ")}`,
        ``,
        `Review the current plan, make any needed updates, and finalize it.`,
    ].join("\n");

    const result = await reviewLoop({
        agentName,
        toolNames: ["read", "edit", "write", "bash"],
        initialPrompt: revisionPrompt,
        triageMeta,
    });

    if (result) {
        const action = await askPostApproval(result.planName);
        if (action === "proceed") {
            await executePlan(result.planName, triageMeta);
        } else {
            console.log(`\n[Harness] Plan saved. Resume later with: deno run -A src/cli.js resume ${result.planName}`);
        }
    }
}

// ─── Plan Execution ───────────────────────────────────────────────────

/**
 * Execute an approved plan — dispatch to engineer (and tester/doc-writer for PROJECT).
 *
 * @param {string} planName
 * @param {Partial<import('./plan-store.js').PlanFrontMatter>} triageMeta
 */
async function executePlan(planName, triageMeta) {
    const plan = await loadPlan(CWD, planName);
    if (!plan) {
        console.error(`[Harness] ERROR: Could not load plan ${planName}`);
        Deno.exit(1);
    }

    console.log(`\n[Harness] === Executing Plan: ${planName} ===\n`);

    if (triageMeta.classification === "PROJECT") {
        // Check if the plan has a Tasks table for multi-agent dispatch
        const tasks = extractTasks(plan.markdown);

        if (tasks.length > 0) {
            console.log(`[Harness] Found ${tasks.length} tasks in plan. Executing in dependency order.\n`);

            for (const task of tasks) {
                const agentName = task.assignee === "engineer" ? "engineer"
                    : task.assignee === "tester" ? "tester"
                    : task.assignee === "doc-writer" ? "doc-writer"
                    : "engineer"; // default

                console.log(`\n[Harness] --- Task ${task.task}: ${task.description} (→ ${agentName}) ---\n`);

                const taskPrompt = [
                    `## Task Assignment`,
                    ``,
                    `You are assigned Task ${task.task} from the plan "${planName}".`,
                    ``,
                    `### Task Description`,
                    task.description,
                    ``,
                    `### Dependencies`,
                    task.dependencies || "None",
                    ``,
                    `### Full Plan Context`,
                    plan.body,
                ].join("\n");

                const taskTools = agentName === "doc-writer"
                    ? ["read", "write", "bash"]
                    : ["read", "edit", "write", "bash"];

                await runSession({
                    agentName,
                    toolNames: taskTools,
                    prompt: taskPrompt,
                });
            }
        } else {
            // No task decomposition — just run engineer with full plan
            await runEngineerWithPlan(planName, plan.body);
        }
    } else {
        // FEATURE — single engineer
        await runEngineerWithPlan(planName, plan.body);
    }

    console.log(`\n[Harness] ✅ Plan execution complete: ${planName}`);
}

/**
 * Run the engineer agent with a full plan.
 *
 * @param {string} planName
 * @param {string} planBody
 */
async function runEngineerWithPlan(planName, planBody) {
    console.log(`[Harness] === Running Engineer ===\n`);

    const engineerPrompt = [
        `## Approved Plan: ${planName}`,
        ``,
        `Execute the following plan step by step. Implement each step, verify the result, then move on.`,
        ``,
        planBody,
    ].join("\n");

    await runSession({
        agentName: "engineer",
        toolNames: ["read", "edit", "write", "bash"],
        prompt: engineerPrompt,
    });
}

// ─── List Plans Command ───────────────────────────────────────────────

async function handleListPlans() {
    const plans = await listPlans(CWD);
    if (plans.length === 0) {
        console.log(`[Harness] No saved plans found.`);
        return;
    }

    console.log(`\n[Harness] Saved plans:\n`);
    for (const p of plans) {
        console.log(`  ${p.name}`);
        console.log(`    Status: ${p.attrs.status} | Classification: ${p.attrs.classification} | Complexity: ${p.attrs.complexity}`);
        console.log(`    Summary: ${p.attrs.summary || "(none)"}`);
        console.log(`    Created: ${p.attrs.createdAt}`);
        console.log();
    }
}

// ─── Main ─────────────────────────────────────────────────────────────

async function main() {
    const args = Deno.args;

    if (args.length === 0) {
        console.error('Usage:');
        console.error('  deno run -A src/cli.js "<user request>"');
        console.error('  deno run -A src/cli.js resume <plan-name>');
        console.error('  deno run -A src/cli.js resume path/to/plan.md');
        console.error('  deno run -A src/cli.js plans');
        Deno.exit(1);
    }

    // ── Subcommands ────────────────────────────────────────────────
    if (args[0] === "resume") {
        if (args.length < 2) {
            console.error('Usage: deno run -A src/cli.js resume <plan-name-or-path>');
            Deno.exit(1);
        }
        await handleResume(args[1]);
        return;
    }

    if (args[0] === "plans") {
        await handleListPlans();
        return;
    }

    // ── Normal Flow ────────────────────────────────────────────────
    const userRequest = args.join(" ");
    console.log(`[Harness] User request: "${userRequest}"`);

    // Ensure plans directory exists
    await ensurePlansDir(CWD);

    // ── Phase A: Router (Triage) ──────────────────────────────────
    console.log("\n[Harness] === Phase A: Router (Triage) ===\n");

    const routerMessages = await runSession({
        agentName: "router",
        toolNames: ["read", "bash"],
        customTools: [triageReportTool],
        prompt: userRequest,
    });

    const triage = extractTriageReport(routerMessages);

    if (!triage) {
        console.error(
            "\n[Harness] ERROR: Router did not produce a triage report.",
        );
        Deno.exit(1);
    }

    console.log(
        `\n[Router] Classification: ${triage.classification}, ` +
        `Complexity: ${triage.complexity}. ` +
        `Summary: ${triage.summary}`,
    );

    // ── Phase B: Decision ────────────────────────────────────────
    if (triage.classification === "QUICK_FIX") {
        // ── B1: Operator (Execute) ──────────────────────────────
        console.log(
            `\n[Harness] QUICK_FIX detected. Handing off to Operator...\n`,
        );
        console.log("[Harness] === Phase B1: Operator (Execute) ===\n");

        const operatorPrompt = [
            `## User Request`,
            userRequest,
            ``,
            `## Triage Report`,
            `- Classification: ${triage.classification}`,
            `- Complexity: ${triage.complexity}`,
            `- Summary: ${triage.summary}`,
            `- Affected paths: ${triage.affectedPaths.join(", ")}`,
            ``,
            `Execute the task above. Inspect the current state, make the change or run the command, and verify the result.`,
        ].join("\n");

        await runSession({
            agentName: "operator",
            toolNames: ["read", "edit", "write", "bash"],
            prompt: operatorPrompt,
        });

        console.log("\n[Harness] ✅ Operator session complete.");
        Deno.exit(0);
    }

    // ── Phase C: Feature Path ────────────────────────────────────
    if (triage.classification === "FEATURE") {
        console.log(
            `\n[Harness] FEATURE detected. Handing off to Planner...\n`,
        );

        const plannerPrompt = [
            `## User Request`,
            userRequest,
            ``,
            `## Triage Report`,
            `- Classification: ${triage.classification}`,
            `- Complexity: ${triage.complexity}`,
            `- Summary: ${triage.summary}`,
            `- Affected paths: ${triage.affectedPaths.join(", ")}`,
            ``,
            `Based on the triage report above, explore the affected files and create a plan in the plans/ directory.`,
            `Choose a descriptive, kebab-case filename (e.g., plans/add-dark-mode-toggle.md).`,
        ].join("\n");

        const result = await reviewLoop({
            agentName: "planner",
            toolNames: ["read", "edit", "write", "bash"],
            initialPrompt: plannerPrompt,
            triageMeta: triage,
        });

        if (result) {
            const action = await askPostApproval(result.planName);
            if (action === "proceed") {
                await executePlan(result.planName, triage);
            } else {
                console.log(`\n[Harness] Plan saved. Resume later with: deno run -A src/cli.js resume ${result.planName}`);
            }
        }
        return;
    }

    // ── Phase D: Project Path ─────────────────────────────────────
    if (triage.classification === "PROJECT") {
        console.log(
            `\n[Harness] PROJECT detected. Handing off to Architect for targeted deep exploration + planning...\n`,
        );

        console.log("[Harness] === Phase D: Architect (Targeted Explore + Plan + Review) ===\n");

        const architectPrompt = [
            `## User Request`,
            userRequest,
            ``,
            `## Triage Report`,
            `- Classification: ${triage.classification}`,
            `- Complexity: ${triage.complexity}`,
            `- Summary: ${triage.summary}`,
            `- Affected paths: ${triage.affectedPaths.join(", ")}`,
            ``,
            `Start with a targeted vertical-slice exploration from the triage input (especially affected paths).`,
            `Go deep on the request-related execution path; avoid broad repo surveys.`,
            `Then produce a comprehensive plan in plans/ with a descriptive kebab-case filename.`,
            `Since this is a PROJECT, include a Tasks table for multi-agent execution.`,
        ].join("\n");

        const result = await reviewLoop({
            agentName: "architect",
            toolNames: ["read", "edit", "write", "bash"],
            initialPrompt: architectPrompt,
            triageMeta: triage,
        });

        if (result) {
            const action = await askApprovalWithTasks(result.planName, triage);
            if (action === "proceed") {
                await executePlan(result.planName, triage);
            } else {
                console.log(`\n[Harness] Plan saved. Resume later with: deno run -A src/cli.js resume ${result.planName}`);
            }
        }
    }
}

/**
 * Post-approval prompt for PROJECT plans — shows task breakdown.
 *
 * @param {string} planName
 * @param {Partial<import('./plan-store.js').PlanFrontMatter>} triageMeta
 * @returns {Promise<"proceed" | "save">}
 */
async function askApprovalWithTasks(planName, triageMeta) {
    const plan = await loadPlan(CWD, planName);
    const tasks = plan ? extractTasks(plan.markdown) : [];

    console.log(`\n[Harness] Project plan "${planName}" approved!`);
    if (tasks.length > 0) {
        console.log(`\nTask breakdown:`);
        for (const t of tasks) {
            console.log(`  ${t.task}. [${t.assignee}] ${t.description}`);
        }
    }
    console.log(`\nWhat would you like to do?`);
    console.log(`  1) Proceed with execution${tasks.length > 0 ? " (tasks will run in dependency order)" : ""}`);
    console.log(`  2) Save for later`);

    const buf = new Uint8Array(256);
    await Deno.stdin.read(buf);
    const answer = new TextDecoder().decode(buf).trim();

    if (answer === "1" || answer.toLowerCase() === "proceed" || answer.toLowerCase() === "p") {
        return "proceed";
    }
    return "save";
}

main().catch((err) => {
    console.error("[Harness] Fatal error:", err);
    Deno.exit(1);
});
