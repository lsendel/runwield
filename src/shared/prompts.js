/**
 * @module shared/prompts
 * Interactive prompt overlays for the TUI.
 */

import { Container, Text, SelectList } from "@mariozechner/pi-tui";
import { getTUI } from "./tui.js";
import { theme, selectListTheme } from "./theme.js";

/**
 * Show a multiple-choice select overlay.
 * @param {string} title
 * @param {Array<{value: string, label: string, description?: string}>} options
 * @returns {Promise<string | null>}
 */
export async function select(title, options) {
  const { tui } = getTUI();

  return new Promise((resolve) => {
    const container = new Container();

    container.addChild(new Text("─".repeat(40), 1, 0));
    container.addChild(new Text(theme.fg("accent", theme.bold(title)), 1, 0));
    container.addChild(new Text("─".repeat(40), 1, 0));

    const selectList = new SelectList(
      options,
      Math.min(options.length, 10),
      selectListTheme
    );

    /** @type {any} */
    let handle = null;

    selectList.onSelect = (item) => {
      if (handle) handle.hide();
      resolve(item.value);
    };

    selectList.onCancel = () => {
      if (handle) handle.hide();
      resolve(null);
    };

    container.addChild(selectList);
    container.addChild(new Text("─".repeat(40), 1, 0));
    container.addChild(new Text(theme.fg("dim", "↑↓ navigate • enter select • esc cancel"), 1, 0));

    const component = {
      /** @param {any} w */
      render: (w) => container.render(w),
      invalidate: () => container.invalidate(),
      /** @param {any} data */
      handleInput: (data) => {
        selectList.handleInput(data);
        tui.requestRender();
      }
    };

    handle = tui.showOverlay(component, {
      width: "80%",
      minWidth: 40,
      anchor: "center",
      margin: 2
    });
  });
}

/**
 * Show a yes/no confirm overlay.
 * @param {string} message
 * @returns {Promise<boolean>}
 */
export async function confirm(message) {
  const result = await select(message, [
    { value: "yes", label: "Yes" },
    { value: "no", label: "No" }
  ]);
  return result === "yes";
}
