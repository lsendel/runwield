import { assertEquals, assertMatch } from "@std/assert";
import { planWrittenTool } from "./plan-written.js";

/**
 * @param {any} tool
 * @param {any} params
 */
async function executeTool(tool, params) {
    return await tool.execute("tool-call-1", params, new AbortController().signal, () => {}, {});
}

/**
 * @param {{ content: Array<{ type: string, text?: string }> }} result
 */
function firstText(result) {
    const first = result.content[0];
    assertEquals(first?.type, "text");
    if (!first || first.type !== "text") throw new Error("Expected text content.");
    return first.text ?? "";
}

Deno.test("planWrittenTool exposes expected metadata", () => {
    assertEquals(planWrittenTool.name, "plan_written");
    assertEquals(planWrittenTool.label, "Plan Written");
    assertMatch(planWrittenTool.description, /Declare the plan filename/i);
    assertEquals(typeof planWrittenTool.execute, "function");
    assertEquals(typeof planWrittenTool.parameters, "object");
});

Deno.test("planWrittenTool execute returns summary content and echoes details", async () => {
    const params = {
        planName: "implement-memory-system",
        tasks: [
            {
                task: 1,
                assignee: "engineer",
                dependencies: "",
                description: "Implement persistence layer",
            },
        ],
    };

    const result = await executeTool(planWrittenTool, params);

    assertEquals(result.details, params);
    assertEquals(firstText(result), "Plan declared: implement-memory-system");
});
