import { assertEquals } from "@std/assert";
import { getCliCommandDefinitions, getCommandDefinition } from "./registry.js";

Deno.test("getCommandDefinition resolves alias", () => {
    const command = getCommandDefinition("agents");
    assertEquals(command?.name, "agent");
});

Deno.test("getCliCommandDefinitions excludes slash-only commands", () => {
    const commands = getCliCommandDefinitions();
    assertEquals(commands.some((c) => c.name === "export"), false);
    assertEquals(commands.some((c) => c.name === "router"), true);
});
