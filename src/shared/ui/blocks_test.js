import { assertEquals } from "@std/assert";
import chalk from "chalk";

// Force chalk to produce ANSI codes in non-TTY test environment
chalk.level = 3;

import {
    AgentMessageBlock,
    PromptSelectBlock,
    PromptTextBlock,
    SpinnerBlock,
    StyledBlock,
    SystemMessageBlock,
    ToolExecutionBlock,
    UserPromptBlock,
} from "./blocks.js";
import { Text } from "@mariozechner/pi-tui";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Compute visible length by stripping all ANSI/APC/OSC sequences.
 * @param {string} str
 */
function visibleLength(str) {
    // deno-lint-ignore no-control-regex
    return str.replace(/\x1b\[[0-9;]*m|\x1b[_\]].*?\x07/g, "").length;
}

/**
 * Assert every line has correct visible width and consistent background.
 * Checks that:
 * 1. Every line is exactly `w` visible chars wide
 * 2. Every line starts with a bg ANSI code
 * 3. After any \x1b[0m (full reset), the bg is re-applied
 *
 * @param {string[]} lines
 * @param {number} w
 * @param {string} blockName - for error messages
 */
function assertBlockBackground(lines, w, blockName) {
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const vl = visibleLength(line);

        assertEquals(vl, w, `${blockName} line ${i}: visible length should be ${w}, got ${vl}`);

        // Every line should start with a bg code
        assertEquals(
            // deno-lint-ignore no-control-regex
            /^\x1b\[48;2;\d+;\d+;\d+m/.test(line),
            true,
            `${blockName} line ${i}: should start with bg ANSI code`,
        );

        // After any \x1b[0m, the bg must be re-applied immediately
        const parts = line.split("\x1b[0m");
        if (parts.length > 1) {
            for (let p = 1; p < parts.length; p++) {
                assertEquals(
                    // deno-lint-ignore no-control-regex
                    /^\x1b\[48;2;\d+;\d+;\d+m/.test(parts[p]),
                    true,
                    `${blockName} line ${i}: bg must be re-applied after \\x1b[0m (part ${p})`,
                );
            }
        }
    }
}

// ─── StyledBlock ─────────────────────────────────────────────────────────────

Deno.test("StyledBlock renders full-width bg lines", () => {
    const w = 80;
    const block = new StyledBlock("surface0", 2, 1, new Text("hello", 0, 0));
    const lines = block.render(w);
    assertBlockBackground(lines, w, "StyledBlock");
});

Deno.test("StyledBlock handles embedded \\x1b[0m in child content", () => {
    const w = 80;
    // Simulate a child that produces content with \x1b[0m (like truncateToWidth)
    const child = {
        render: () => ["before \x1b[0m after"],
        invalidate: () => {},
    };
    const block = new StyledBlock("surface0", 2, 1, child);
    const lines = block.render(w);
    assertBlockBackground(lines, w, "StyledBlock(with reset)");
});

// ─── UserPromptBlock ─────────────────────────────────────────────────────────

Deno.test("UserPromptBlock renders with consistent background", () => {
    const w = 100;
    const block = new UserPromptBlock("Hello world");
    const lines = block.render(w);
    assertBlockBackground(lines, w, "UserPromptBlock");
});

// ─── AgentMessageBlock ───────────────────────────────────────────────────────

Deno.test("AgentMessageBlock renders with consistent background", () => {
    const w = 100;
    const block = new AgentMessageBlock("TestAgent");
    block.appendText("Some markdown **content** here.");
    const lines = block.render(w);
    assertBlockBackground(lines, w, "AgentMessageBlock");
});

// ─── SystemMessageBlock ──────────────────────────────────────────────────────

Deno.test("SystemMessageBlock renders with consistent background", () => {
    const w = 100;
    const block = new SystemMessageBlock("[Harns] System message");
    const lines = block.render(w);
    assertBlockBackground(lines, w, "SystemMessageBlock");
});

Deno.test("SystemMessageBlock error renders with consistent background", () => {
    const w = 100;
    const block = new SystemMessageBlock("[Error] Something failed", true);
    const lines = block.render(w);
    assertBlockBackground(lines, w, "SystemMessageBlock(error)");
});

// ─── ToolExecutionBlock ──────────────────────────────────────────────────────

Deno.test("ToolExecutionBlock renders with consistent background (no output)", () => {
    const w = 100;
    const block = new ToolExecutionBlock("bash", "ls -la");
    block.endExecution(false, 150);
    const lines = block.render(w);
    assertBlockBackground(lines, w, "ToolExecutionBlock(empty)");
});

Deno.test("ToolExecutionBlock renders with consistent background (with output)", () => {
    const w = 100;
    const block = new ToolExecutionBlock("bash", "ls -la");
    block.appendOutput("file1.txt\nfile2.txt\nfolder/\n");
    block.endExecution(false, 250);
    const lines = block.render(w);
    assertBlockBackground(lines, w, "ToolExecutionBlock(output)");
});

Deno.test("ToolExecutionBlock error renders with consistent background", () => {
    const w = 100;
    const block = new ToolExecutionBlock("bash", "bad-command");
    block.appendOutput("command not found: bad-command\n");
    block.endExecution(true, 100);
    const lines = block.render(w);
    assertBlockBackground(lines, w, "ToolExecutionBlock(error)");
});

Deno.test("ToolExecutionBlock strips ANSI from tool output", () => {
    const w = 100;
    const block = new ToolExecutionBlock("bash", "ls --color");
    // Simulate colored ls output with full resets
    block.appendOutput("\x1b[35mfile.txt\x1b[0m\n\x1b[34mfolder\x1b[0m\n");
    block.endExecution(false, 50);
    // Body text should have ANSI stripped
    assertEquals(block.bodyText, "file.txt\nfolder\n");
    const lines = block.render(w);
    assertBlockBackground(lines, w, "ToolExecutionBlock(colored output)");
});

// ─── PromptSelectBlock ───────────────────────────────────────────────────────

Deno.test("PromptSelectBlock renders with uniform background", () => {
    const w = 100;
    const items = [
        { value: "option1", label: "Option 1", description: "First option" },
        { value: "option2", label: "Option 2", description: "Second option" },
    ];
    const block = new PromptSelectBlock("Choose:", items);
    block.focus();
    const lines = block.render(w);
    assertBlockBackground(lines, w, "PromptSelectBlock");

    // All lines should use the same bg color (surface1 = #45475a → 69,71,90)
    const bgCodes = lines.map((line) => {
        // deno-lint-ignore no-control-regex
        const m = line.match(/^\x1b\[48;2;(\d+;\d+;\d+)m/);
        return m ? m[1] : null;
    });
    const uniqueBgs = [...new Set(bgCodes)];
    assertEquals(uniqueBgs.length, 1, `PromptSelectBlock should have uniform bg, got: ${uniqueBgs.join(", ")}`);
});

Deno.test("PromptSelectBlock handles long items that trigger truncation", () => {
    const w = 80;
    const items = [
        {
            value: "very-long-plan-name-that-will-be-truncated-by-the-select-list",
            label: "very-long-plan-name-that-will-be-truncated-by-the-select-list",
            description: "This description is also quite long and should trigger truncation in the list",
        },
        { value: "short", label: "Short", description: "A short one" },
    ];
    const block = new PromptSelectBlock("Resume plan:", items);
    block.focus();
    const lines = block.render(w);
    assertBlockBackground(lines, w, "PromptSelectBlock(truncated)");
});

// ─── PromptTextBlock ─────────────────────────────────────────────────────────

Deno.test("PromptTextBlock renders with uniform background", () => {
    const w = 100;
    const block = new PromptTextBlock("Enter value:");
    block.focus();
    const lines = block.render(w);
    assertBlockBackground(lines, w, "PromptTextBlock");

    // All lines should use the same bg color
    const bgCodes = lines.map((line) => {
        // deno-lint-ignore no-control-regex
        const m = line.match(/^\x1b\[48;2;(\d+;\d+;\d+)m/);
        return m ? m[1] : null;
    });
    const uniqueBgs = [...new Set(bgCodes)];
    assertEquals(uniqueBgs.length, 1, `PromptTextBlock should have uniform bg, got: ${uniqueBgs.join(", ")}`);
});

// ─── SpinnerBlock ────────────────────────────────────────────────────────────

Deno.test("SpinnerBlock renders full-width lines when busy", () => {
    const w = 80;
    const spinner = new SpinnerBlock();
    spinner.setBusy(true);
    const lines = spinner.render(w);
    for (let i = 0; i < lines.length; i++) {
        const vl = visibleLength(lines[i]);
        assertEquals(vl, w, `SpinnerBlock line ${i}: visible length should be ${w}, got ${vl}`);
    }
});
