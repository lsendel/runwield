import { assertEquals } from "@std/assert";
import { extractPlanWritten, extractTriageReport, parseTriageFromText } from "./triage.js";

Deno.test("parseTriageFromText parses classification and defaults complexity", () => {
    const parsed = parseTriageFromText('classification: FEATURE\nsummary: "hello"');
    assertEquals(parsed?.classification, "FEATURE");
    assertEquals(parsed?.complexity, "MEDIUM");
});

Deno.test("parseTriageFromText parses unquoted summary and yaml affected paths", () => {
    const parsed = parseTriageFromText(
        "classification: QUICK_FIX\ncomplexity: LOW\nsummary: fix typo\naffectedPaths:\n - src/a.ts\n - src/b.ts",
    );
    assertEquals(parsed?.summary, "fix typo");
    assertEquals(parsed?.affectedPaths, ["src/a.ts", "src/b.ts"]);
});

Deno.test("parseTriageFromText handles invalid affectedPaths json", () => {
    const parsed = parseTriageFromText(
        'classification: PROJECT\ncomplexity: HIGH\nsummary: "big"\naffectedPaths: [invalid',
    );
    assertEquals(parsed?.classification, "PROJECT");
    assertEquals(parsed?.affectedPaths, []);
});

Deno.test("extractTriageReport prefers tool result", () => {
    const triage = extractTriageReport([
        /** @type {any} */ ({
            role: "toolResult",
            toolName: "triage_report",
            details: { classification: "QUICK_FIX", complexity: "LOW", summary: "s", affectedPaths: [] },
        }),
    ]);
    assertEquals(triage?.classification, "QUICK_FIX");
});

Deno.test("extractTriageReport parses assistant fallback text", () => {
    const triage = extractTriageReport([
        /** @type {any} */ ({
            role: "assistant",
            content: [{ type: "text", text: 'classification: FEATURE\ncomplexity: MEDIUM\nsummary: "x"' }],
        }),
    ]);
    assertEquals(triage?.classification, "FEATURE");
});

Deno.test("extractTriageReport returns null when missing", () => {
    assertEquals(
        extractTriageReport([/** @type {any} */ ({ role: "assistant", content: [{ type: "text", text: "nothing" }] })]),
        null,
    );
});

Deno.test("extractPlanWritten returns details", () => {
    const out = extractPlanWritten([
        /** @type {any} */ ({
            role: "toolResult",
            toolName: "plan_written",
            details: {
                planName: "abc",
                tasks: [{ task: 1, assignee: "engineer", dependencies: "", description: "do" }],
            },
        }),
    ]);
    assertEquals(out?.planName, "abc");
    assertEquals(out?.tasks?.length, 1);
});

Deno.test("extractPlanWritten returns null when absent", () => {
    assertEquals(extractPlanWritten([]), null);
});
