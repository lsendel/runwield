import { assertEquals, assertMatch } from "@std/assert";
import { runExportCommand } from "./index.js";

Deno.test("runExportCommand reports error when session export fails", async () => {
    /** @type {string[]} */
    const messages = [];

    await runExportCommand([], {
        text: "/export",
        sessionStartedAt: "2026-05-01T19:44:54.629Z",
        uiAPI: {
            appendSystemMessage: (msg) => messages.push(msg),
            appendAgentMessageStart: () => ({ appendText: () => {} }),
            requestRender: () => {},
            promptSelect: () => Promise.resolve(null),
            promptText: () => Promise.resolve(null),
        },
        editor: {
            disableSubmit: false,
            setText: () => {},
            setAutocompleteProvider: () => {},
            handleInput: () => {},
        },
        // Intentionally incomplete to trigger export failure path
        sessionManager: /** @type {any} */ ({}),
    });

    assertEquals(messages.length, 1);
    assertMatch(messages[0], /Failed to export session:/);
});
