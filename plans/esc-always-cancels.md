# Plan: Esc always cancels active work

## Context

- User reports that after an LLM error ("retry later"), Harns can remain stuck showing `Thinking...` and pressing `Esc`
  no longer recovers the UI.
- Requirement confirmed: `Esc` must cancel **everything** interactive (agent runs, plan review waits, bash commands, and
  choice/input prompts) and immediately return control.
- Requirement confirmed: prioritize UI interactivity over strict shutdown; late results are acceptable to drop.
- Quick code finding: `Esc` in `chat-session.js` currently only calls `abortActiveSession()` and
  `cancelActivePlanReview()`. If no active session is tracked (or it already errored), Esc does not force-clear UI busy
  state.

## Approach

- Introduce a single active-operation cancellation contract in the interactive session layer:
  - register the current operation’s cancel callback (agent run, slash command wait, bash exec, plan review wait, prompt
    block wait),
  - invoke it from a unified `Esc` path,
  - always perform immediate UI recovery (`disableSubmit=false`, `setBusy(false)`, input enabled, editor focus).
- Add operation generation/token gating so late async updates from canceled work are ignored rather than rendered.
- Make running `!bash` cancellable by tracking the active child process and terminating it on `Esc`.
- Keep existing operation-specific cancel primitives (`abortActiveSession`, `cancelActivePlanReview`) and compose them
  into the unified cancel flow.
- Keep cancellation idempotent: repeated `Esc` presses are safe no-ops after first cancellation.

## Files to modify

- `src/shared/chat-session.js` (primary Esc orchestration, active operation tracking, bash cancellation, UI fallback
  reset)
- `src/shared/session/session.js` (defensive agent cleanup and suppression hooks for canceled runs)
- `src/shared/ui/api.js` and/or `src/shared/ui/types.js` (if minimal API surface is needed to register/cancel active
  prompt waits)
- `src/shared/workflow/submit-plan.js` (reuse current plan-review cancel primitive in shared cancel path)
- `src/shared/session/session-state.js` (only if shared active-cancel registration is cleaner than local chat-session
  closure state)
- New tests (likely `src/shared/*_test.js` for cancellation orchestration and stale-result dropping)

## Reuse

- Existing Esc interception in `src/shared/chat-session.js` (`editor.handleInput` override).
- Existing session cancellation primitive: `abortActiveSession()` in `src/shared/session/session.js` (aborts all tracked
  active sessions).
- Existing plan-review cancellation primitive: `cancelActivePlanReview()` in `src/shared/workflow/submit-plan.js`.
- Existing prompt cancellation behavior in UI blocks (`PromptSelectBlock`/`PromptTextBlock` settle to `null` on Esc).
- Existing UI reset controls in chat flow: `uiAPI.setBusy(false)`, `uiAPI.enableInput()`,
  `editor.disableSubmit = false`.
- Existing busy toggles in `runAgentSession` event subscription (`turn_start`/`turn_end`) to preserve normal behavior
  when not canceled.

## Steps

- [x] Map interactive operations in `chat-session` and mark where each registers a cancel function (agent run, slash
      command execution, prompt-template run, `!bash`, plan-review wait, prompt blocks).
- [x] Implement unified `Esc` handler in `chat-session.js` that:
  - calls registered operation cancel callback(s),
  - falls back to `abortActiveSession()` and `cancelActivePlanReview()`,
  - always restores interactivity immediately.
- [x] Implement cancellation token/generation checks so late results from canceled operations are dropped.
- [x] Add cancellable handling for running `!bash` process (track process handle, kill on `Esc`, stop appending output
      after cancel).
- [x] Harden `runAgentSession` finalization so busy/thinking artifacts are cleared on abort/error edge paths.
- [x] Add tests for: Esc during agent retry/stall, Esc during plan review wait, Esc during `!bash`, and stale-result
      suppression after cancel.
- [x] Run `deno run ci` and manual TUI repro flow for the originally reported stuck `Thinking...` case.

## Verification

- Reproduce reported case: trigger provider error/retry path, press `Esc`, verify `Thinking...` clears and prompt is
  usable immediately.
- Start a long `!bash` command, press `Esc`, verify command is terminated and UI input returns immediately.
- Open a choice prompt (`/agent`, `/model`, resume prompts, interview prompts), press `Esc`, verify prompt
  closes/cancels.
- During plan review wait, press `Esc`, verify wait stops and UI returns immediately.
- Confirm late outputs from canceled operations are not rendered.
- Run `deno run ci`.
