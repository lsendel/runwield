/**
 * @module shared/chat-session
 * High-level interactive UI session for the TUI.
 */

import { Container, Spacer, Text, Markdown, Editor, matchesKey, Key, Image } from "@mariozechner/pi-tui";
import { initTUI, stopTUI } from "./tui.js";
import { theme, editorTheme, markdownTheme, imageTheme } from "./theme.js";
import { readClipboardImage } from "./clipboard.js";

/**
 * Starts the interactive TUI session.
 * @param {string} initialPrompt
 * @param {(prompt: string, images: any[], uiAPI: import('./workflow.js').UiAPI) => Promise<void>} onMessage - Handler for user submissions
 */
export async function startInteractiveSession(initialPrompt, onMessage) {
  const tui = initTUI();
  
  const container = new Container();
  
  // Header
  container.addChild(new Spacer(1));
  container.addChild(new Text(theme.fg("accent", theme.bold("Harns ─ Plan-by-Default Harness")), 1, 0));
  container.addChild(new Spacer(1));
  
  const messageList = new Container();
  container.addChild(messageList);
  container.addChild(new Spacer(1));
  
  /** @type {Array<{base64: string, mimeType: string}>} */
  const pastedImages = [];
  const previewImages = new Container();
  container.addChild(previewImages);
  
  const editor = new Editor(tui, editorTheme);
  container.addChild(editor);

  // Footer
  const cwd = Deno.cwd().replace(Deno.env.get("HOME") || "", "~");
  let branch = "main";
  try {
    const cmd = new Deno.Command("git", { args: ["branch", "--show-current"] });
    const { success, stdout } = cmd.outputSync();
    if (success) {
      branch = new TextDecoder().decode(stdout).trim();
    }
  } catch (e) {
    branch = "unknown";
  }
  let model = "gemini-2.5-flash";
  let provider = "unknown";
  try {
    const homeDir = Deno.env.get("HOME") || "";
    /** @type {Record<string, any>} */
    let settings = {};
    try {
      const globalPath = `${homeDir}/.pi/agent/settings.json`;
      settings = JSON.parse(Deno.readTextFileSync(globalPath));
    } catch (e) {}
    try {
      const localPath = `${Deno.cwd()}/.pi/settings.json`;
      const projSettings = JSON.parse(Deno.readTextFileSync(localPath));
      settings = { ...settings, ...projSettings };
    } catch (e) {}
    
    if (settings.defaultModel) model = settings.defaultModel;
    if (settings.defaultProvider) provider = settings.defaultProvider;
  } catch (e) {}

  const footer = {
    invalidate: () => {},
    /** @param {number} w */
    render: (w) => {
      const leftStr = `${cwd} (${branch})`;
      const rightStr = `(${provider}) ${model}`;
      const spaceCount = Math.max(0, w - leftStr.length - rightStr.length - 1);
      return [theme.fg("dim", " " + leftStr + " ".repeat(spaceCount) + rightStr)];
    }
  };
  container.addChild(footer);
  
  const rootWrapper = {
    invalidate: () => container.invalidate(),
    /** @param {number} w */
    render: (w) => {
      const rightMargin = 2;
      const rendered = container.render(Math.max(10, w - rightMargin));
      return rendered;
    }
  };
  
  tui.addChild(rootWrapper);
  tui.setFocus(editor);

  // Expose an API for agents to append to the message list
  const uiAPI = {
    /** @param {string} text */
    appendUserMessage: (text) => {
      messageList.addChild(new Text(theme.fg("accent", theme.bold("You:"))));
      messageList.addChild(new Markdown(text, 0, 0, markdownTheme));
      messageList.addChild(new Spacer(1));
      tui.requestRender();
    },
    /** @param {string} agentName */
    appendAgentMessageStart: (agentName) => {
      messageList.addChild(new Text(theme.fg("success", theme.bold(`${agentName}:`))));
      let currentText = "";
      const md = new Markdown("", 0, 0, markdownTheme);
      messageList.addChild(md);
      messageList.addChild(new Spacer(1));
      tui.requestRender();
      return {
        /** @param {string} delta */
        appendText: (delta) => {
          currentText += delta;
          md.setText(currentText);
          tui.requestRender();
        }
      };
    },
    /** @param {string} text */
    appendSystemMessage: (text) => {
      messageList.addChild(new Text(theme.fg("dim", text)));
      messageList.addChild(new Spacer(1));
      tui.requestRender();
    },
    /** 
     * @param {string} base64
     * @param {string} mimeType
     */
    appendImage: (base64, mimeType) => {
      const img = new Image(base64, mimeType, imageTheme, { maxWidthCells: 60, maxHeightCells: 20 });
      messageList.addChild(img);
      tui.requestRender();
    },
    requestRender: () => {
      tui.requestRender();
    }
  };

  // Handle Editor events
  editor.onSubmit = async (text) => {
    const prompt = text.trim();
    if (!prompt) return;
    
    if (prompt === "/quit" || prompt === "/exit" || prompt === "/q") {
      editor.setText("");
      tui.requestRender();
      // Wait for render before stopping TUI
      setTimeout(() => {
        stopTUI();
        // Fallback exit in case event loop is not empty
        setTimeout(() => Deno.exit(0), 100);
      }, 50);
      return;
    }
    
    editor.disableSubmit = true;
    editor.setText("");
    
    // Check if there are queued images (pasted)
    const images = [...pastedImages];
    pastedImages.length = 0; // clear array in place
    previewImages.clear(); // remove previews
    
    uiAPI.appendUserMessage(prompt);
    images.forEach(img => uiAPI.appendImage(img.base64, img.mimeType));

    // Send to Handler
    try {
      await onMessage(prompt, images, uiAPI);
    } catch (err) {
      uiAPI.appendSystemMessage(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      editor.disableSubmit = false;
    }
  };

    // Re-render UI after handling pasted images
    tui.requestRender();

  // Custom keybindings for Editor
  const originalHandleInput = editor.handleInput.bind(editor);
  /** @param {any} data */
  editor.handleInput = async (data) => {
    // Ctrl+V for paste image
    if (matchesKey(data, Key.ctrl("v"))) {
      const img = await readClipboardImage();
      if (img) {
        pastedImages.push(img);
        previewImages.addChild(new Text(theme.fg("dim", `[Attached image: ${img.mimeType}]`)));
        tui.requestRender();
      }
      return;
    }
    // Shift+Enter or Alt+Enter for new line
    if (matchesKey(data, Key.shift("enter")) || matchesKey(data, Key.alt("enter"))) {
      /** @type {any} */ (editor).addNewLine();
      tui.requestRender();
      return;
    }
    // Delete pasted images when editor is empty
    if (matchesKey(data, Key.backspace) && /** @type {any} */ (editor).isEditorEmpty() && pastedImages.length > 0) {
      pastedImages.pop();
      const lastChild = previewImages.children[previewImages.children.length - 1];
      if (lastChild) previewImages.removeChild(lastChild);
      tui.requestRender();
      return;
    }
    originalHandleInput(data);
  };

  // Trigger initial prompt
  if (initialPrompt) {
    editor.setText(initialPrompt);
    editor.onSubmit(initialPrompt);
  }
}
