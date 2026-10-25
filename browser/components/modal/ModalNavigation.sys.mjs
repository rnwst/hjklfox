/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  Keymap,
  keyToken,
  hintLabels,
} from "moz-src:///browser/components/modal/Keymap.sys.mjs";
import { configureSimplifiedChrome } from "moz-src:///browser/components/modal/SimplifiedChrome.sys.mjs";

const PREF = "browser.modal.enabled";
const KEYMAP_PREF = "browser.modal.keybindings";
const SHEET = "chrome://browser/content/modal/modal.css";
const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  ModalUrlbar: "moz-src:///browser/components/modal/ModalUrlbar.sys.mjs",
});

function send(actor, name, data) {
  try {
    actor?.sendAsyncMessage(name, data);
    return !!actor;
  } catch {
    // A frame can disappear between key dispatch and delivery.
    return false;
  }
}

/** Own keyboard input and modal state once per browser window, before content. */
export class ModalNavigation {
  static init(win) {
    return new ModalNavigation(win);
  }

  constructor(win) {
    configureSimplifiedChrome(win);
    this.window = win;
    this.mode = "command";
    this.suppressed = new Set();
    this.generation = 0;
    this.hints = null;
    this.tabFocusPending = false;
    this.chromeEditing = false;
    this.observe = this.configure.bind(this);
    Services.prefs.addObserver(PREF, this.observe);
    Services.prefs.addObserver(KEYMAP_PREF, this.observe);
    for (const type of [
      "keydown",
      "keypress",
      "keyup",
      "focusin",
      "blur",
      "unload",
    ]) {
      const target = type.startsWith("key") ? win.windowRoot : win;
      target.addEventListener(type, this, true);
    }
    win.gBrowser.tabContainer.addEventListener("TabSelect", this);
    win.gBrowser.addProgressListener(this);
    win.document.l10n.addResourceIds(["browser/modal.ftl"]);
    this.indicator = win.document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "span"
    );
    this.indicator.id = "modal-mode-indicator";
    this.indicator.setAttribute("role", "status");
    win.document.getElementById("nav-bar").appendChild(this.indicator);
    win.windowUtils.loadSheetUsingURIString(
      SHEET,
      win.windowUtils.AUTHOR_SHEET
    );
    this.configure();
  }

  get enabled() {
    return Services.prefs.getBoolPref(PREF, false);
  }

  get activeElement() {
    return (
      Services.focus.getFocusedElementForWindow(this.window, false, {}) ||
      this.window.document.activeElement
    );
  }

  isAddressBarFocus(element = this.activeElement) {
    const bar = this.window.gURLBar;
    return element === bar.inputField || (bar.focused && bar.contains(element));
  }

  focusMode(element) {
    if (this.isAddressBarFocus(element)) {
      return "address";
    }
    return element?.matches("input, textarea, [contenteditable=true]")
      ? "insert"
      : "command";
  }

  configure() {
    let overrides = {};
    try {
      const value = JSON.parse(Services.prefs.getStringPref(KEYMAP_PREF, "{}"));
      if (value && typeof value === "object" && !Array.isArray(value)) {
        overrides = value;
      }
    } catch (error) {
      console.error("Invalid modal keybindings", error);
    }
    this.keymap = new Keymap(overrides);
    if (this.enabled && !this.urlbar) {
      this.urlbar = new lazy.ModalUrlbar(this.window);
    }
    this.urlbar?.reset();
    const mode = this.focusMode(this.activeElement);
    this.chromeEditing = mode !== "command";
    this.setMode(mode);
    if (!this.enabled) {
      this.window.document.documentElement.removeAttribute("modal-mode");
    }
  }

  setMode(mode) {
    if (mode === "insert" && this.isAddressBarFocus()) {
      mode = "address";
    }
    this.cancelHints();
    this.keymap.reset();
    this.mode = mode;
    this.documentId =
      this.window.gBrowser.selectedBrowser.browsingContext.currentWindowGlobal?.innerWindowId;
    this.tabFocusPending = false;
    if (this.enabled) {
      this.window.document.documentElement.setAttribute("modal-mode", mode);
      this.updateIndicator();
    }
  }

  updateIndicator() {
    if (this.hints) {
      this.window.document.l10n.setAttributes(
        this.indicator,
        "modal-mode-hints",
        {
          count: this.hints.targets.length,
          prefix: this.hints.prefix,
        }
      );
    } else {
      this.window.document.l10n.setAttributes(
        this.indicator,
        `modal-mode-${this.mode}`
      );
    }
  }

  onLocationChange(webProgress, request, location, flags) {
    if (
      this.enabled &&
      webProgress.isTopLevel &&
      !(flags & Ci.nsIWebProgressListener.LOCATION_CHANGE_SAME_DOCUMENT)
    ) {
      this.noteDocument();
    }
  }

  noteDocument() {
    const id =
      this.window.gBrowser.selectedBrowser.browsingContext.currentWindowGlobal
        ?.innerWindowId;
    if (id && id !== this.documentId) {
      if (this.chromeEditing) {
        this.documentId = id;
      } else {
        this.setMode("command");
      }
    }
  }

  actors() {
    const result = [];
    const visit = context => {
      if (context.isUnderHiddenEmbedderElement) {
        return;
      }
      try {
        const actor = context.currentWindowGlobal?.getActor("Modal");
        if (actor) {
          result.push(actor);
        }
      } catch {}
      for (const child of context.children) {
        visit(child);
      }
    };
    visit(this.window.gBrowser.selectedBrowser.browsingContext);
    return result;
  }

  focusedActor() {
    const browser = this.window.gBrowser.selectedBrowser;
    let context = Services.focus.focusedContentBrowsingContext;
    if (context?.top !== browser.browsingContext) {
      context = browser.browsingContext;
    }
    try {
      return context.currentWindowGlobal?.getActor("Modal");
    } catch {
      return null;
    }
  }

  handleEvent(event) {
    const win = this.window;
    if (event.type === "unload") {
      if (event.target === win.document) {
        this.destroy();
      }
      return;
    }
    if (!this.enabled) {
      return;
    }
    if (event.type === "TabSelect") {
      this.urlbar?.reset();
      this.chromeEditing = this.isAddressBarFocus();
      this.setMode(this.chromeEditing ? "address" : "command");
      return;
    }
    if (event.type === "blur") {
      if (event.target === win) {
        this.cancelHints();
        this.keymap.reset();
        this.suppressed.clear();
      }
      return;
    }
    const active = this.activeElement;
    const inContent = active === win.gBrowser.selectedBrowser;
    if (event.type === "focusin") {
      if (event.target.ownerDocument === win.document) {
        const mode = this.focusMode(active);
        if (mode !== "command") {
          this.chromeEditing = true;
          this.setMode(mode);
        } else if (this.chromeEditing) {
          this.urlbar?.reset();
          this.chromeEditing = false;
          const tabFocusPending = this.tabFocusPending;
          this.setMode("command");
          this.tabFocusPending = tabFocusPending;
        }
      }
      return;
    }
    if (!event.isTrusted || event.isComposing) {
      return;
    }
    const code = event.code || event.key;
    if (event.type !== "keydown") {
      if (this.suppressed.has(code)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
      if (event.type === "keyup") {
        this.suppressed.delete(code);
      }
      return;
    }
    if (["Shift", "Control", "Alt", "Meta", "AltGraph"].includes(event.key)) {
      return;
    }
    this.tabFocusPending =
      event.key === "Tab" && !event.ctrlKey && !event.altKey && !event.metaKey;
    if (
      win.document.querySelector(
        'panel[panelopen="true"], menupopup[open="true"]'
      )
    ) {
      return;
    }
    const inAddress = this.isAddressBarFocus(active);
    if (inAddress && event.key === "Escape") {
      this.consume(event);
      this.exitAddressBar().catch(console.error);
      return;
    }
    if (!inContent && inAddress && this.urlbar?.handleKey(event)) {
      this.consume(event);
      return;
    }
    if (event.key === "Escape") {
      this.escape(event, active, inContent);
      return;
    }
    if (!inContent) {
      return;
    }
    if (this.mode === "insert") {
      return;
    }
    const token = keyToken(event);
    if (token === null) {
      this.keymap.reset();
      return;
    }
    const printable = event.key.length === 1 && !event.ctrlKey;
    if (this.hints && (printable || event.key === "Backspace")) {
      this.consume(event);
      this.filterHints(event.key);
      return;
    }
    if (!printable && !this.keymap.accepts(token)) {
      this.keymap.reset();
      return;
    }
    this.consume(event);
    const action = this.keymap.feed(token);
    if (action && (!event.repeat || action.command.startsWith("scroll."))) {
      if (this.hints && !action.command.startsWith("scroll.")) {
        this.cancelHints();
      }
      this.execute(action);
    }
  }

  consume(event) {
    this.documentId =
      this.window.gBrowser.selectedBrowser.browsingContext.currentWindowGlobal?.innerWindowId;
    this.suppressed.add(event.code || event.key);
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  escape(event, active, inContent) {
    const win = this.window;
    if (win.document.fullscreenElement || win.PointerLock.isActive) {
      return;
    }
    if (
      this.mode === "insert" ||
      this.hints ||
      this.keymap.prefix ||
      this.keymap.count ||
      (!inContent &&
        active.matches?.("input, textarea, [contenteditable=true]"))
    ) {
      this.consume(event);
      const wasInsert = this.mode === "insert";
      this.setMode("command");
      if (inContent && wasInsert) {
        send(this.focusedActor(), "Modal:Blur");
      } else if (!inContent) {
        if (win.gFindBarInitialized && active.closest("findbar")) {
          win.gFindBar.close();
        }
        win.gBrowser.selectedBrowser.focus();
      }
    }
  }

  async exitAddressBar() {
    const browser = this.window.gBrowser.selectedBrowser;
    if (
      !(await this.urlbar.exit()) ||
      this.window.closed ||
      browser !== this.window.gBrowser.selectedBrowser
    ) {
      return;
    }
    this.chromeEditing = false;
    this.setMode("command");
    browser.focus();
    send(this.focusedActor(), "Modal:Blur");
  }

  execute({ command, count }) {
    if (command.startsWith("urlbar.")) {
      this.urlbar.open(command.slice("urlbar.".length)).catch(console.error);
      return;
    }
    const browser = this.window.gBrowser;
    switch (command) {
      case "find.open":
        this.window.gLazyFindCommand("onFindCommand");
        break;
      case "find.next":
      case "find.previous":
        this.window.gLazyFindCommand(
          "onFindAgainCommand",
          command === "find.previous"
        );
        break;
      case "mode.insert":
        this.setMode("insert");
        send(this.focusedActor(), "Modal:Insert");
        break;
      case "tab.next":
      case "tab.previous":
        for (let i = 0; i < count; i++) {
          browser.tabContainer.advanceSelectedTab(
            command === "tab.next" ? 1 : -1,
            true
          );
        }
        break;
      case "history.back":
        if (browser.selectedBrowser.canGoBack) {
          browser.selectedBrowser.goBack();
        }
        break;
      case "history.forward":
        if (browser.selectedBrowser.canGoForward) {
          browser.selectedBrowser.goForward();
        }
        break;
      case "hint.follow":
        this.startHints().catch(console.error);
        break;
      default:
        if (command.startsWith("scroll.")) {
          send(this.focusedActor(), "Modal:Scroll", {
            command,
            count,
          });
        }
    }
  }

  async startHints() {
    this.cancelHints();
    const generation = this.generation;
    this.hints = { prefix: "", targets: [], actors: this.actors() };
    const session = this.hints;
    for (const actor of session.actors) {
      actor.trackHints(this, generation);
    }
    const [title, buttonName] = await Promise.all([
      this.window.document.l10n.formatValue("modal-hints-title"),
      this.window.document.l10n.formatValue("modal-hint-button"),
    ]);
    if (generation !== this.generation) {
      return;
    }
    const counts = await Promise.all(
      session.actors.map(async actor => {
        try {
          const count = await actor.sendQuery("Modal:Collect", { generation });
          return Number.isInteger(count) && count >= 0 && count <= 1000
            ? count
            : 0;
        } catch {
          return 0;
        }
      })
    );
    if (generation !== this.generation) {
      return;
    }
    const labels = hintLabels(counts.reduce((sum, count) => sum + count, 0));
    let offset = 0;
    for (let i = 0; i < session.actors.length; i++) {
      const actor = session.actors[i];
      const frameLabels = labels.slice(offset, offset + counts[i]);
      if (
        frameLabels.length &&
        send(actor, "Modal:Show", {
          generation,
          labels: frameLabels,
          title,
          buttonName,
        })
      ) {
        frameLabels.forEach((label, index) =>
          session.targets.push({ label, actor, index })
        );
      }
      offset += counts[i];
    }
    if (!session.targets.length) {
      this.cancelHints();
    } else if (session.prefix) {
      this.filterHints("");
    } else {
      this.updateIndicator();
    }
  }

  filterHints(key) {
    const session = this.hints;
    session.prefix =
      key === "Backspace" ? session.prefix.slice(0, -1) : session.prefix + key;
    const selected = session.targets.find(
      target => target.label === session.prefix
    );
    if (selected) {
      send(selected.actor, "Modal:Activate", {
        generation: this.generation,
        index: selected.index,
      });
      this.cancelHints();
    } else {
      this.updateIndicator();
      for (const actor of session.actors) {
        send(actor, "Modal:Filter", {
          generation: this.generation,
          prefix: session.prefix,
        });
      }
    }
  }

  cancelHints() {
    const hadHints = !!this.hints;
    for (const actor of this.hints?.actors || []) {
      send(actor, "Modal:Clear");
    }
    this.hints = null;
    this.generation++;
    if (hadHints) {
      this.updateIndicator();
    }
  }

  removeHintFrame(actor, generation, topLevel) {
    if (
      !this.hints ||
      generation !== this.generation ||
      !this.hints.actors.includes(actor)
    ) {
      return;
    }
    if (topLevel) {
      this.cancelHints();
      return;
    }
    this.hints.actors = this.hints.actors.filter(item => item !== actor);
    this.hints.targets = this.hints.targets.filter(
      item => item.actor !== actor
    );
    this.updateIndicator();
  }

  destroy() {
    this.urlbar?.destroy();
    this.cancelHints();
    Services.prefs.removeObserver(PREF, this.observe);
    Services.prefs.removeObserver(KEYMAP_PREF, this.observe);
    for (const type of [
      "keydown",
      "keypress",
      "keyup",
      "focusin",
      "blur",
      "unload",
    ]) {
      const target = type.startsWith("key")
        ? this.window.windowRoot
        : this.window;
      target.removeEventListener(type, this, true);
    }
    this.window.gBrowser.tabContainer.removeEventListener("TabSelect", this);
    this.window.gBrowser.removeProgressListener(this);
  }
}
