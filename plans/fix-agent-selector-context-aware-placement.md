---
classification: "FEATURE"
complexity: "MEDIUM"
summary: "The /agent startup positioning bug is still present because overlay placement is terminal-viewport relative (from pi-tui), while the desired behavior is chat/editor-context relative right after launch. Current bottom-center anchoring in chat-session reliably pushes the selector to the terminal bottom. Fix likely requires a small placement strategy change (compute row/offset from active layout or add a dedicated prompt placement mode) rather than only changing anchor defaults."
affectedPaths:
    - "src/shared/chat-session.js"
    - "src/shared/ui/api.js"
    - "src/shared/workflow.js"
    - "src/shared/prompts.js"
createdAt: "2026-04-30T03:37:09.421Z"
updatedAt: "2026-04-30T03:43:19.276Z"
status: "approved"
origin: "internal"
---

## Objective

Redesign all TUI prompts (`promptSelect`, `promptText`, including the `/agent` selector) to render as inline blocks in
the chat stream instead of using spatial overlays. This aligns interactive elements with standard message/tool-call logs
and definitively resolves any viewport/anchor placement bugs.

## File Impacts

| File                         | Action | Description                                                                                                                                                                                    |
| ---------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/ui/blocks.js`    | Modify | Add new `PromptSelectBlock` and `PromptTextBlock` classes that wrap `SelectList` and `Input` TUI components inside standard padded colored blocks.                                             |
| `src/shared/ui/api.js`       | Modify | Rewrite `promptSelect` and `promptText` to instantiate these new blocks, append them to `messageList`, steal focus, and resolve promises on user input, replacing all `tui.showOverlay` logic. |
| `src/shared/chat-session.js` | Modify | Remove `anchor: "bottom-center"` from `/agent` call; ensure UI flow reliably restores focus to the main editor when prompts resolve.                                                           |
| `src/shared/workflow.js`     | Modify | Remove `overlayOptions` from API typings/documentation.                                                                                                                                        |
| `src/shared/prompts.js`      | Modify | Remove any leftover overlay configuration arguments.                                                                                                                                           |

## Implementation Steps

- [ ] Step 1: In `src/shared/ui/blocks.js`, create a `PromptSelectBlock` class. It should build a UI container with the
      prompt title, `<SelectList>` (clamped to ~10 items), and hint text, wrapped in a `ColoredBlock`. Implement
      `handleInput(data)` and standard TUI component methods so it can receive focus. Add `settle(value)` to disable
      input and lock its visual state.
- [ ] Step 2: In `src/shared/ui/blocks.js`, create a `PromptTextBlock` class mirroring Step 1 but wrapping an `<Input>`.
      Manage hint texts (like "non-empty required") and handle input routing. Add a similar `settle(value)` method.
- [ ] Step 3: In `src/shared/ui/api.js`, remove all `showOverlay` logic in `promptSelect`. Instead, instantiate
      `PromptSelectBlock`, use `messageList.addChild(...)`, call `tui.setFocus(block)` (by having the block return a
      proxy or directly focus its internal list if needed, or by ensuring the api has access to `tui.setFocus`), and
      return a Promise that resolves when the block triggers selection/cancel.
- [ ] Step 4: In `src/shared/ui/api.js`, perform the same refactor for `promptText`. Add block to `messageList`,
      transfer focus, await resolution.
- [ ] Step 5: For both `promptSelect` and `promptText`, when the promise settles, have the block switch visually to an
      "answered" or "cancelled" state (e.g. grayed out title or showing the chosen option), and optionally call
      `tui.setFocus(editor)` (the `createUiApi` stub will either need a reliable way to refocus the editor or rely on
      the caller to restore focus, but since `chat-session.js` calls `tui.setFocus(editor)` after prompts anyway, just
      make sure to safely release the block). Note: remove the block from `messageList` OR keep it locked in the history
      based on visual cleanliness (usually, keeping a one-line summary block is standard). Let's keep a history record
      showing the chosen option and remove the rest of the interactive UI from the list.
- [ ] Step 6: In `src/shared/chat-session.js`, locate the `/agent` command flow and remove the
      `overlayOptions: { anchor: 'bottom-center', ... }` argument since overlays are now defunct.
- [ ] Step 7: Clean up JSDoc typedefs in `src/shared/workflow.js` and `src/shared/ui/api.js` to strike out
      `OverlayOptions`. Update `src/shared/prompts.js` if it continues to pass overlay objects.
- [ ] Step 8: Run `deno check src/cli.js`, `deno lint`, and `deno fmt`.
- [ ] Step 9: Launch the system (e.g. `deno run cli.js`) and run `/agent` natively to visually verify the block
      rendering and editor focus restoration. Run `deno task ci` to ensure all tests pass.

## Edge Cases & Considerations

- Focus management must be tight. The TUI's internal system must correctly route keystrokes to the new `messageList`
  child block. The TUI router might expect focused components to live in a certain tree configuration. Check TUI focus
  assumptions.
- Large option lists when acting as blocks will push previous messages upward. Ensure TUI scrolling behavior correctly
  tracks the newly appended interactive block.
- Upon block completion or cancellation, the UI should swap the large multi-line prompt into a compact 1-line recap
  block to avoid cluttering chat history entirely with giant menus.
