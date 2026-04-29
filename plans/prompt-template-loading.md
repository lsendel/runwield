# Prompt Template Loading + Slash Commands

## Context

- Add prompt-template support to Harns similar to Pi.
- Prompt files should become slash commands in the TUI, with parameterized expansion support.
- For now, all prompt-template slash commands should execute via the `operator` agent by default.
- Templates should be layered with override precedence: local (`./.hns/prompts`) > home (`~/.hns/prompts`) > bundled
  (`src/prompt-templates`).
- `sleep` should be converted from hardcoded command logic (`src/cmd/sleep/index.js`) into a prompt template.
- Mnemosyne binary availability should be checked at app boot.

## Approach

- Reuse Pi SDK prompt-template support via `DefaultResourceLoader` + session prompt expansion, instead of
  re-implementing parser/substitution.
- Introduce Harns prompt-template discovery paths and wire them into agent session resource loading.
- Match Pi collision semantics: first template by name wins, so path order must be local → home → bundled.
- Keep built-in slash commands higher priority than prompt templates; templates with colliding names remain loaded but
  are non-invokable.
- Teach TUI slash-command handling/autocomplete to recognize loaded prompt templates and dispatch them to the `operator`
  agent handler.
- Convert sleep request into a bundled prompt template while keeping `hns sleep` as a top-level compatibility command.
- Add mnemosyne preflight at interactive boot and agent-execution entrypoints, hard-failing when missing.

## Files to modify

- `src/shared/session.js`
- `src/shared/chat-session.js`
- `src/shared/runtime-preflight.js` (new)
- `src/constants.js`
- `src/cmd/sleep/index.js`
- `src/shared/help-text.js`
- `deno.json`
- `src/prompt-templates/sleep.md` (new)

## Reuse

- Agent layering pattern already implemented in `src/shared/session.js` (`resolveAgentDefsDir`, `listAgentDefNames`,
  `loadAgentDef`).
- Pi prompt-template expansion is already built into `AgentSession.prompt()` when the text starts with `/...`
  (`pi-mono/packages/coding-agent/src/core/agent-session.ts`).
- Pi prompt-template loading and collision handling already exists in `DefaultResourceLoader`
  (`pi-mono/packages/coding-agent/src/core/resource-loader.ts`, `prompt-templates.ts`), including:
  - non-recursive `.md` discovery per directory
  - first-name-wins collision behavior in prompt dedupe
  - argument expansion support (`$1`, `$@`, `${@:N}`)
- Existing direct-agent execution path (`runAgentSession` / `createDirectAgentHandler`) can be reused so prompt commands
  always target `operator`.
- Existing slash-command plumbing already executes `commandRegistry` commands in-chat; prompt templates can be injected
  as an additional slash-command source before unknown-command fallback.

## Steps

- [ ] Add bundled prompt-template directory constants (`src/prompt-templates`) and include it in compile bundling
      (`deno task compile` currently only includes `src/agent-definitions`).
- [ ] Implement layered prompt-template path resolution with precedence local > home > bundled.
- [ ] Wire prompt paths into `DefaultResourceLoader` via `additionalPromptTemplatePaths` + `noPromptTemplates: true` so
      Harns uses `.hns` layers + bundled prompts (not `.pi` defaults).
- [ ] Add prompt-template metadata loader for TUI boot/autocomplete (name, description, argument hint, source path),
      loaded once per interactive session.
- [ ] Define chat built-in slash names (quit/exit/q, agent, and chat-enabled command handlers), keep built-ins highest
      priority, and treat colliding prompt names as blocked.
- [ ] Update chat slash-command flow: after built-ins, if slash token matches an invokable prompt template, dispatch the
      raw slash input to `operator` (not the currently selected chat agent) instead of reporting unknown command.
- [ ] At TUI boot, list loaded prompt templates and append warnings for blocked local/home templates using user-facing
      paths (`./.hns/prompts/<name>.md`, `~/.hns/prompts/<name>.md`).
- [ ] Convert sleep request into `src/prompt-templates/sleep.md` and remove hardcoded sleep prompt text from JS.
- [ ] Keep `hns sleep` compatibility command by sending `/sleep` through agent execution path.
- [ ] Add shared mnemosyne preflight helper and run it at interactive boot and agent-execution command entrypoints;
      hard-fail with install guidance when missing.
- [ ] Update help text for sleep/prompt-template behavior.

## Verification

- `deno task check`
- `deno task ci`
- Manual:
  - Start `hns`, verify prompt templates are listed at boot and invokable templates appear in slash autocomplete.
  - Create same template name across bundled/home/local and verify effective command content follows local > home >
    bundled.
  - Verify template args expansion (e.g. `$1`, `$@`) works when dispatched from slash command.
  - Verify prompt command always runs via `operator` even after `/agent <name>` switch.
  - Create a local/home prompt with a built-in name (e.g. `help.md`) and verify TUI warning says it cannot be invoked
    and should be renamed.
  - Verify built-ins still win for collisions (`/help`, `/resume`, `/agent`, `/q`, etc.).
  - Verify `hns sleep` still works and now routes via `/sleep` template.
  - Verify hard-fail behavior when `mnemosyne` is missing for interactive boot and execution commands, while
    non-execution commands (e.g. `hns --help`, `hns plans`) still work.

## Decisions captured

- Keep `hns sleep` as a top-level command for compatibility.
- All prompt-template slash commands (including `/sleep`) execute via `operator` by default.
- Missing `mnemosyne` is a hard failure.
- Mnemosyne preflight should run only for interactive boot and execution command paths.
- Built-in slash commands always win over prompt-template names.
- When a local/home prompt collides with a built-in command, warn in the TUI at boot but continue startup.
