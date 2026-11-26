/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  Keymap,
  keyToken,
  hintLabels,
  SELECT_BINDINGS,
  INSERT_BINDINGS,
  ADDRESS_BINDINGS,
} from "moz-src:///browser/components/modal/Keymap.sys.mjs";
import { configureSimplifiedChrome } from "moz-src:///browser/components/modal/SimplifiedChrome.sys.mjs";
import { ModalKeyPopup } from "moz-src:///browser/components/modal/ModalKeyPopup.sys.mjs";
import { ModalFind } from "moz-src:///browser/components/modal/ModalFind.sys.mjs";
import { ModalTabs } from "moz-src:///browser/components/modal/ModalTabs.sys.mjs";
import { ModalShortcuts } from "moz-src:///browser/components/modal/ModalShortcuts.sys.mjs";
import { ModalClipboard } from "moz-src:///browser/components/modal/ModalClipboard.sys.mjs";

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
    this.shortcuts = new ModalShortcuts(win);
    this.nativeDialogs = 0;
    this.find = new ModalFind(this);
    this.tabs = new ModalTabs(win);
    this.keyPopup = new ModalKeyPopup(win);
    this.clipboard = new ModalClipboard(win);
    this.mode = "command";
    this.suppressed = new Set();
    this.forwardedKeys = new Map();
    this.arrowAltRelease = false;
    this.arrowFocusVersion = 0;
    this.pageBlockedKeys = new Set();
    this.generation = 0;
    this.hints = null;
    this.tabFocusPending = false;
    this.chromeEditing = false;
    this.chromeTabIndexes = new WeakMap();
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
      "popupshowing",
      "popuphidden",
      "DOMWillOpenModalDialog",
      "DOMModalDialogClosed",
      "dialogopen",
      "dialogclose",
      "pointerdown",
      "pointerup",
      "MozDOMFullscreen:Entered",
      "MozDOMFullscreen:Exited",
    ]) {
      const target = type.startsWith("key") ? win.windowRoot : win;
      target.addEventListener(type, this, true);
    }
    win.gBrowser.tabContainer.addEventListener("TabSelect", this);
    win.gBrowser.tabContainer.addEventListener("TabClose", this);
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

  get inDOMFullscreen() {
    return (
      this.window.document.fullscreenElement ===
      this.window.gBrowser.selectedBrowser
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
    if (this.isFindBarFocus(element)) {
      return "search";
    }
    return element?.matches("input, textarea, [contenteditable=true]")
      ? "insert"
      : "command";
  }

  isChromeEditor(element) {
    return (
      element === this.window.gURLBar.inputField || this.isFindBarFocus(element)
    );
  }

  isFindBarFocus(element = this.activeElement) {
    return element?.matches("findbar:not([hidden]) .findbar-textbox");
  }

  isNavigationChrome(element) {
    for (
      let node = element;
      node;
      node = node.parentElement || node.getRootNode()?.host
    ) {
      if (node.id === "navigator-toolbox" || node.localName === "findbar") {
        return true;
      }
    }
    return false;
  }

  excludeChromeEditorFromTabOrder(element) {
    if (!this.chromeTabIndexes.has(element)) {
      this.chromeTabIndexes.set(element, element.getAttribute("tabindex"));
    }
    element.tabIndex = -1;
  }

  restoreChromeTabOrder() {
    const editors = [
      this.window.gURLBar.inputField,
      ...this.window.document.querySelectorAll("findbar .findbar-textbox"),
    ];
    for (const element of editors) {
      if (!this.chromeTabIndexes.has(element)) {
        continue;
      }
      const tabindex = this.chromeTabIndexes.get(element);
      if (tabindex === null) {
        element.removeAttribute("tabindex");
      } else {
        element.setAttribute("tabindex", tabindex);
      }
    }
    this.chromeTabIndexes = new WeakMap();
  }

  redirectChromeFocus() {
    if (this.chromeEditing && this.mode === "address") {
      this.window.gURLBar.inputField.focus();
    } else if (
      this.chromeEditing &&
      this.window.gFindBarInitialized &&
      !this.window.gFindBar.hidden
    ) {
      this.window.gFindBar._findField.focus();
    } else {
      this.chromeEditing = false;
      this.setMode("command");
      this.window.gBrowser.selectedBrowser.focus();
    }
  }

  configure() {
    if (this.historyEnabled !== this.enabled) {
      this.historyEnabled = this.enabled;
      this.tabs.resetHistory(
        this.enabled ? this.window.gBrowser.selectedTab : null
      );
    }
    this.selectionKeymap = new Keymap({}, SELECT_BINDINGS);
    this.keymap = Keymap.fromJSON(
      Services.prefs.getStringPref(KEYMAP_PREF, "{}")
    );
    if (this.enabled) {
      for (const tab of this.window.gBrowser.tabs) {
        this.window.gURLBar.getBrowserState(tab.linkedBrowser).urlbarFocused =
          false;
        tab._findBarFocused = false;
      }
      this.excludeChromeEditorFromTabOrder(this.window.gURLBar.inputField);
      if (this.window.gFindBarInitialized) {
        this.excludeChromeEditorFromTabOrder(this.window.gFindBar._findField);
      }
    } else {
      this.fullscreenBrowser = null;
      this.restoreChromeTabOrder();
    }
    if (this.enabled && !this.urlbar) {
      this.urlbar = new lazy.ModalUrlbar(this.window);
    }
    this.urlbar?.reset();
    if (this.enabled && this.inDOMFullscreen) {
      this.updateFullscreen();
      return;
    }
    if (
      this.enabled &&
      this.isNavigationChrome(this.activeElement) &&
      !this.isChromeEditor(this.activeElement)
    ) {
      this.chromeEditing = false;
      this.redirectChromeFocus();
      return;
    }
    const mode = this.focusMode(this.activeElement);
    this.chromeEditing = mode !== "command";
    this.setMode(mode);
    if (!this.enabled) {
      this.window.document.documentElement.removeAttribute("modal-mode");
    }
  }

  setMode(mode) {
    if (this.nativeDialogs || this.hasOpenNativePopup()) {
      mode = "command";
    } else if (this.enabled && this.inDOMFullscreen) {
      mode = "insert";
    } else if (mode === "insert" && this.isAddressBarFocus()) {
      mode = "address";
    } else if (mode === "insert" && this.isFindBarFocus()) {
      mode = "search";
    }
    if (mode !== "search") {
      this.find.cancel();
    }
    if (mode !== "select") {
      this.tabs.setSelectionCursor(null);
    }
    if (mode !== "insert") {
      this.splitPickerBrowser = null;
    }
    this.cancelHints(false);
    this.resetKeys();
    if (this.mode !== mode) {
      this.arrowFocusVersion++;
    }
    this.mode = mode;
    this.updateShortcuts();
    this.find.updateOptions();
    for (const actor of this.actors()) {
      send(actor, "Modal:Mode", { insert: mode === "insert" });
    }
    this.documentId =
      this.window.gBrowser.selectedBrowser.browsingContext.currentWindowGlobal?.innerWindowId;
    this.tabFocusPending = false;
    if (this.enabled) {
      this.window.document.documentElement.setAttribute("modal-mode", mode);
      this.updateIndicator();
    }
  }

  updateIndicator() {
    if (this.mode === "hint" && !this.hints) {
      return;
    }
    if (this.mode === "select") {
      this.window.document.l10n.setAttributes(
        this.indicator,
        "modal-mode-select",
        {
          count: this.window.gBrowser.selectedTabs.length,
        }
      );
    } else if (this.hints) {
      this.window.document.l10n.setAttributes(
        this.indicator,
        this.hints.newTab ? "modal-mode-hints-new-tab" : "modal-mode-hints",
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
      if (
        this.chromeEditing ||
        this.mode === "select" ||
        (this.splitPickerBrowser === this.window.gBrowser.selectedBrowser &&
          ["about:blank", "about:opentabs"].includes(
            this.splitPickerBrowser.currentURI.spec
          ))
      ) {
        this.documentId = id;
      } else {
        this.setMode("command");
      }
    }
  }

  openSplit() {
    const browser = this.window.gBrowser;
    const previous = browser.selectedTab;
    this.window.BrowserCommands.addTabSplitView();
    if (browser.selectedTab !== previous) {
      this.splitPickerBrowser = browser.selectedBrowser;
      this.setMode("insert");
      this.splitPickerBrowser.focus();
    }
  }

  async focusSplitPicker(actor) {
    const browser = this.splitPickerBrowser;
    if (
      !browser ||
      browser !== this.window.gBrowser.selectedBrowser ||
      this.mode !== "insert" ||
      actor.manager.documentURI.spec !== "about:opentabs"
    ) {
      return;
    }
    try {
      await actor.sendQuery("Modal:FocusSplitPicker");
    } catch {
      // The picker may have navigated or closed while its components initialized.
    }
    if (this.splitPickerBrowser === browser) {
      this.splitPickerBrowser = null;
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

  handleChromeFocus(event, active) {
    if (this.nativeDialogs || this.hasOpenNativePopup()) {
      return;
    }
    if (event.target.ownerDocument !== this.window.document) {
      return;
    }
    if (this.inDOMFullscreen) {
      return;
    }
    if (this.isNavigationChrome(active) && !this.isChromeEditor(active)) {
      event.stopImmediatePropagation();
      this.redirectChromeFocus();
      return;
    }
    if (this.isChromeEditor(active)) {
      this.excludeChromeEditorFromTabOrder(active);
    }
    const mode = this.focusMode(active);
    if (mode === "address") {
      this.urlbar?.ensureDefaultMode();
    }
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

  updateFullscreen() {
    const win = this.window;
    if (this.inDOMFullscreen) {
      this.fullscreenBrowser = win.gBrowser.selectedBrowser;
      this.chromeEditing = false;
      this.urlbar?.reset();
      this.setMode("insert");
      this.fullscreenBrowser.focus();
    } else if (!win.document.fullscreenElement && this.fullscreenBrowser) {
      const browser = this.fullscreenBrowser;
      this.fullscreenBrowser = null;
      if (browser === win.gBrowser.selectedBrowser) {
        this.chromeEditing = false;
        this.setMode("command");
        browser.focus();
      }
    }
  }

  handleTabSelect() {
    this.urlbar?.reset();
    this.chromeEditing = this.isAddressBarFocus();
    if (this.chromeEditing) {
      this.urlbar?.ensureDefaultMode();
    }
    this.setMode(this.chromeEditing ? "address" : "command");
  }

  hasOpenPopup(allowAddress = false) {
    return [
      ...this.window.document.querySelectorAll(
        'panel:not([role="tooltip"]), menupopup'
      ),
    ].some(
      popup =>
        !(allowAddress && popup === this.window.gURLBar.view.panel) &&
        (popup.state === "open" || popup.state === "showing")
    );
  }

  isNativePopup(popup) {
    return (
      popup.ownerDocument === this.window.document &&
      popup.matches?.('panel:not([role="tooltip"]), menupopup') &&
      !popup.matches('[type^="autocomplete"], #invalid-form-popup')
    );
  }

  hasOpenNativePopup() {
    return [...this.window.document.querySelectorAll("panel, menupopup")].some(
      popup =>
        this.isNativePopup(popup) &&
        (popup.state === "open" || popup.state === "showing")
    );
  }

  updateShortcuts() {
    this.shortcuts.setBlocked(
      this.enabled && (this.mode !== "command" || !!this.keymap?.prefix)
    );
  }

  handleNativeUIEvent(event) {
    switch (event.type) {
      case "popupshowing":
      case "popuphidden":
        if (!this.isNativePopup(event.target)) {
          return true;
        }
        break;
      case "DOMWillOpenModalDialog":
      case "dialogopen":
        this.nativeDialogs++;
        break;
      case "DOMModalDialogClosed":
      case "dialogclose":
        this.nativeDialogs = Math.max(0, this.nativeDialogs - 1);
        break;
      default:
        return false;
    }
    this.chromeEditing = false;
    this.setMode("command");
    return true;
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
    if (event.type.startsWith("MozDOMFullscreen:")) {
      this.updateFullscreen();
      return;
    }
    if (this.handleNativeUIEvent(event)) {
      return;
    }
    if (event.type === "pointerdown") {
      this.tabFocusPending = false;
      this.resetKeys();
      return;
    }
    if (event.type === "pointerup") {
      if (
        this.isNavigationChrome(event.target) &&
        [win.document.body, win.document.documentElement].includes(
          this.activeElement
        )
      ) {
        this.redirectChromeFocus();
      }
      return;
    }
    if (event.type === "TabSelect") {
      this.arrowFocusVersion++;
      this.tabs.recordSelection(event.target);
      this.handleTabSelect();
      return;
    }
    if (event.type === "TabClose") {
      this.tabs.forgetTab(event.target);
      return;
    }
    if (event.type === "blur") {
      if (event.target === win) {
        this.arrowFocusVersion++;
        this.cancelHints();
        this.resetKeys();
        this.suppressed.clear();
        this.arrowAltRelease = false;
        for (const { target, command } of this.forwardedKeys.values()) {
          this.sendArrow(target, { command, type: "keyup" });
        }
        this.forwardedKeys.clear();
        this.pageBlockedKeys.clear();
      }
      return;
    }
    let active = this.activeElement;
    let inContent = active === win.gBrowser.selectedBrowser;
    if (event.type === "focusin") {
      this.arrowFocusVersion++;
      this.handleChromeFocus(event, active);
      return;
    }
    this.handleAltKey(event);
    const forwarded = this.forwardedKeys.get(event.code || event.key);
    if (event.isTrusted && forwarded) {
      this.consume(event);
      if (event.type !== "keypress") {
        this.sendArrow(forwarded.target, {
          command: forwarded.command,
          type: event.type,
          repeat: event.repeat,
          count: 1,
        });
      }
      if (event.type === "keyup") {
        this.forwardedKeys.delete(event.code || event.key);
        this.pageBlockedKeys.delete(event.code || event.key);
        this.finishKey(event);
      }
      return;
    }
    if (
      this.nativeDialogs ||
      this.hasOpenPopup(this.isAddressBarFocus(active))
    ) {
      this.finishKey(event);
      if (event.type === "keyup") {
        this.pageBlockedKeys.delete(event.code || event.key);
      }
      return;
    }
    if (
      !event.isTrusted ||
      event.isComposing ||
      this.blockPageKeyTail(event, inContent)
    ) {
      return;
    }
    if (event.type !== "keydown") {
      this.finishKey(event);
      return;
    }
    if (this.handleArrowKey(event, inContent)) {
      return;
    }
    if (this.inDOMFullscreen) {
      return;
    }
    if (["Shift", "Control", "Alt", "Meta", "AltGraph"].includes(event.key)) {
      return;
    }
    this.clipboard.hideError();
    this.tabFocusPending =
      event.key === "Tab" && !event.ctrlKey && !event.altKey && !event.metaKey;
    if (keyToken(event) === "C-w" && !["command", "hint"].includes(this.mode)) {
      this.consume(event);
      return;
    }
    if ([win.document.body, win.document.documentElement].includes(active)) {
      const tabFocusPending = this.tabFocusPending;
      this.chromeEditing = false;
      this.setMode("command");
      this.tabFocusPending = tabFocusPending;
      win.gBrowser.selectedBrowser.focus();
      active = this.activeElement;
      inContent = active === win.gBrowser.selectedBrowser;
    }
    const inAddress = this.isAddressBarFocus(active);
    if (this.find.blocksAccessKey(event)) {
      this.consume(event);
      return;
    }
    if (this.find.isSubmitKey(event, active)) {
      this.consume(event);
      this.find.submit(active.closest("findbar"));
      this.chromeEditing = false;
      this.setMode("command");
      win.gBrowser.selectedBrowser.focus();
      return;
    }
    if (event.key === "Tab" && !inContent && this.isChromeEditor(active)) {
      this.consume(event);
      this.tabFocusPending = false;
      return;
    }
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
    this.handleCommandKey(event);
  }

  handleAltKey(event) {
    if (!event.isTrusted || event.key !== "Alt") {
      return;
    }
    if (event.type === "keyup") {
      if (this.arrowAltRelease) {
        // The consumed letter must not make this look like an Alt-only tap.
        event.preventDefault();
      }
      this.arrowAltRelease = false;
    } else if (event.type === "keydown" && !event.repeat) {
      this.arrowAltRelease = false;
    }
  }

  handleArrowKey(event, inContent) {
    if (event.shiftKey) {
      return false;
    }
    let bindings;
    if (inContent && this.mode === "insert") {
      bindings = INSERT_BINDINGS;
    } else if (this.mode === "address" && this.isAddressBarFocus()) {
      bindings = ADDRESS_BINDINGS;
    }
    const command = bindings?.[keyToken(event, { allowAlt: true })];
    if (!command?.startsWith("key.")) {
      return false;
    }
    this.arrowAltRelease = true;
    this.consume(event);
    if (!event.repeat) {
      this.forwardArrow(event, { command });
    }
    return true;
  }

  handleCommandKey(event) {
    const token = keyToken(event);
    if (token === null) {
      if (this.keymap.prefix) {
        this.consume(event);
      }
      this.resetKeys();
      return;
    }
    const printable = event.key.length === 1 && !event.ctrlKey;
    if (this.hints && (printable || event.key === "Backspace")) {
      this.consume(event);
      this.filterHints(event.key);
      return;
    }
    const keymap = this.mode === "select" ? this.selectionKeymap : this.keymap;
    if (!printable && !keymap.accepts(token)) {
      if (keymap.prefix) {
        this.consume(event);
      }
      this.resetKeys();
      return;
    }
    this.consume(event);
    const action = keymap.feed(token);
    this.updateShortcuts();
    if (this.hints && !printable && keymap.prefix) {
      const { prefix, count } = keymap;
      this.cancelHints();
      // Leaving hint mode resets the parser; retain the newly started sequence.
      keymap.prefix = prefix;
      keymap.count = count;
      this.updateShortcuts();
      this.keyPopup.update(keymap).catch(console.error);
    }
    this.keyPopup.update(keymap).catch(console.error);
    if (
      action &&
      (!event.repeat ||
        action.command.startsWith("scroll.") ||
        action.command.startsWith("selection."))
    ) {
      if (this.hints && !action.command.startsWith("scroll.")) {
        this.cancelHints();
      }
      if (action.command.startsWith("key.")) {
        this.forwardArrow(event, action);
      } else {
        this.execute(action);
      }
    }
  }

  forwardArrow(event, action) {
    const target = {
      browser: this.window.gBrowser.selectedBrowser,
      actor: this.focusedActor(),
      input: this.mode === "address" ? this.window.gURLBar.inputField : null,
      focusVersion: this.arrowFocusVersion,
    };
    this.forwardedKeys.set(event.code || event.key, {
      target,
      command: action.command,
    });
    this.sendArrow(target, {
      ...action,
      type: "keydown",
      repeat: event.repeat,
    });
  }

  canSendArrow(target) {
    if (
      this.window.closed ||
      !this.enabled ||
      this.nativeDialogs ||
      target.browser !== this.window.gBrowser.selectedBrowser ||
      this.hasOpenPopup(!!target.input)
    ) {
      return false;
    }
    if (target.input) {
      return (
        this.mode === "address" &&
        this.activeElement === target.input &&
        this.arrowFocusVersion === target.focusVersion
      );
    }
    return (
      this.activeElement === target.browser &&
      target.actor === this.focusedActor()
    );
  }

  sendArrow(target, { command, type, repeat = false, count = 1 }) {
    const key = {
      "key.left": "ArrowLeft",
      "key.down": "ArrowDown",
      "key.up": "ArrowUp",
      "key.right": "ArrowRight",
    }[command];
    // Dispatch after the original key finishes its input transaction.
    Services.tm.dispatchToMainThread(() => {
      if (!this.canSendArrow(target)) {
        return;
      }
      this.keyProcessor ||= Cc[
        "@mozilla.org/text-input-processor;1"
      ].createInstance(Ci.nsITextInputProcessor);
      if (!this.keyProcessor.beginInputTransaction(this.window, () => true)) {
        return;
      }
      const event = new this.window.KeyboardEvent("", {
        key,
        code: key,
        repeat,
      });
      if (type === "keyup") {
        this.keyProcessor.keyup(event);
      } else {
        for (let i = 0; i < count; i++) {
          this.keyProcessor.keydown(event);
          if (i < count - 1) {
            this.keyProcessor.keyup(event);
          }
        }
      }
    });
  }

  consume(event) {
    this.documentId =
      this.window.gBrowser.selectedBrowser.browsingContext.currentWindowGlobal?.innerWindowId;
    this.suppressed.add(event.code || event.key);
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  finishKey(event) {
    const code = event.code || event.key;
    if (this.suppressed.has(code)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
    if (event.type === "keyup") {
      this.suppressed.delete(code);
    }
  }

  blockPageKeyTail(event, inContent) {
    const code = event.code || event.key;
    const blocked =
      inContent && this.mode === "insert" && this.pageBlockedKeys.has(code);
    if (
      event.type === "keydown" &&
      this.mode !== "insert" &&
      !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)
    ) {
      this.pageBlockedKeys.add(code);
    } else if (event.type === "keyup") {
      this.pageBlockedKeys.delete(code);
      if (blocked) {
        this.suppressed.delete(code);
      }
    }
    if (blocked) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
    return blocked;
  }

  resetKeys() {
    this.clipboard.hideError();
    this.keymap.reset();
    this.selectionKeymap.reset();
    this.keyPopup.hide();
    this.updateShortcuts();
  }

  escape(event, active, inContent) {
    const win = this.window;
    if (win.document.fullscreenElement || win.PointerLock.isActive) {
      return;
    }
    if (
      this.mode === "insert" ||
      this.mode === "select" ||
      this.find.opening ||
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
          this.find.close();
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
    this.enterCommand();
  }

  enterCommand() {
    this.chromeEditing = false;
    this.setMode("command");
    this.window.gBrowser.selectedBrowser.focus();
    send(this.focusedActor(), "Modal:Blur");
  }

  execute({ command, count }) {
    if (command.startsWith("clipboard.")) {
      this.clipboard.execute(command.slice("clipboard.".length));
      return;
    }
    if (command.startsWith("group.")) {
      this.tabs.execute(command.slice("group.".length));
      return;
    }
    if (command.startsWith("urlbar.")) {
      this.urlbar.open(command.slice("urlbar.".length)).catch(console.error);
      return;
    }
    const browser = this.window.gBrowser;
    switch (command) {
      case "bookmark.add":
        this.window.PlacesCommandHook.bookmarkPage().catch(console.error);
        break;
      case "tab.new":
        this.window.BrowserCommands.openTab();
        break;
      case "tab.new-before":
        this.window.BrowserCommands.openTab({
          tabIndex: browser.selectedTab.index,
        });
        break;
      case "tab.reopen":
        this.window.SessionWindowUI.restoreLastClosedTabOrWindowOrSession(
          this.window
        );
        break;
      case "tab.close":
        this.window.BrowserCommands.closeTabOrWindow();
        break;
      case "tab.pin":
      case "tab.unpin":
        this.tabs.setPinned(command === "tab.pin");
        break;
      case "tab.select":
        this.tabs.startSelection();
        break;
      case "tab.deselect":
        this.tabs.replaceSelection([browser.selectedTab]);
        break;
      case "tab.history-back":
      case "tab.history-forward":
        this.tabs.traverseHistory(
          command === "tab.history-back" ? -1 : 1,
          count
        );
        break;
      case "selection.next":
      case "selection.previous":
      case "selection.first":
      case "selection.last":
        this.tabs.extendSelection(
          ["selection.next", "selection.last"].includes(command) ? 1 : -1,
          count,
          ["selection.first", "selection.last"].includes(command)
        );
        break;
      case "split.new":
        this.openSplit();
        break;
      case "split.separate":
        this.window.BrowserCommands.separateTabSplitView();
        break;
      case "find.open":
        this.find.open().catch(console.error);
        break;
      case "find.next":
      case "find.previous":
        this.find.again(command === "find.previous");
        break;
      case "mode.insert":
        this.setMode("insert");
        send(this.focusedActor(), "Modal:Insert");
        break;
      case "tab.first":
      case "tab.last":
      case "tab.group-first":
      case "tab.group-last":
        this.tabs.edge(
          command.endsWith("last") ? 1 : -1,
          false,
          command.startsWith("tab.group-")
        );
        break;
      case "tab.move-first":
      case "tab.move-last":
      case "tab.group-move-first":
      case "tab.group-move-last":
        this.tabs.edge(
          command.endsWith("last") ? 1 : -1,
          true,
          command.startsWith("tab.group-")
        );
        break;
      case "tab.move-next":
      case "tab.move-previous":
      case "tab.group-move-next":
      case "tab.group-move-previous":
        this.tabs.move(
          command.endsWith("next") ? 1 : -1,
          count,
          command.startsWith("tab.group-")
        );
        break;
      case "tab.next":
      case "tab.previous":
      case "tab.group-next":
      case "tab.group-previous":
        this.tabs.cycle(
          command.endsWith("next") ? 1 : -1,
          count,
          command.startsWith("tab.group-")
        );
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
      case "hint.follow-new-tab":
        this.startHints(command === "hint.follow-new-tab").catch(console.error);
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

  async startHints(newTab = false) {
    this.setMode("hint");
    const generation = this.generation;
    this.hints = {
      prefix: "",
      targets: [],
      actors: this.actors(),
      newTab,
      ready: false,
    };
    const session = this.hints;
    for (const actor of session.actors) {
      actor.trackHints(this, generation);
    }
    const [title, buttonName, editorName] = await Promise.all([
      this.window.document.l10n.formatValue(
        newTab ? "modal-hints-new-tab-title" : "modal-hints-title"
      ),
      this.window.document.l10n.formatValue("modal-hint-button"),
      this.window.document.l10n.formatValue("modal-hint-editor"),
    ]);
    if (generation !== this.generation) {
      return;
    }
    const counts = await Promise.all(
      session.actors.map(async actor => {
        try {
          const count = await actor.sendQuery("Modal:Collect", {
            generation,
            newTab,
          });
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
          editorName,
        })
      ) {
        frameLabels.forEach((label, index) =>
          session.targets.push({ label, actor, index })
        );
      }
      offset += counts[i];
    }
    session.ready = true;
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
    } else if (
      session.ready &&
      !session.targets.some(target => target.label.startsWith(session.prefix))
    ) {
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

  cancelHints(leaveMode = true) {
    const hadHints = !!this.hints;
    for (const actor of this.hints?.actors || []) {
      send(actor, "Modal:Clear");
    }
    this.hints = null;
    this.generation++;
    if (leaveMode && this.mode === "hint") {
      this.setMode("command");
    }
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
    this.tabs.resetHistory();
    this.find.destroy();
    this.restoreChromeTabOrder();
    this.keyPopup.destroy();
    this.clipboard.destroy();
    this.urlbar?.destroy();
    this.cancelHints();
    this.shortcuts.destroy();
    Services.prefs.removeObserver(PREF, this.observe);
    Services.prefs.removeObserver(KEYMAP_PREF, this.observe);
    for (const type of [
      "keydown",
      "keypress",
      "keyup",
      "focusin",
      "blur",
      "unload",
      "popupshowing",
      "popuphidden",
      "DOMWillOpenModalDialog",
      "DOMModalDialogClosed",
      "dialogopen",
      "dialogclose",
      "pointerdown",
      "pointerup",
      "MozDOMFullscreen:Entered",
      "MozDOMFullscreen:Exited",
    ]) {
      const target = type.startsWith("key")
        ? this.window.windowRoot
        : this.window;
      target.removeEventListener(type, this, true);
    }
    this.window.gBrowser.tabContainer.removeEventListener("TabSelect", this);
    this.window.gBrowser.tabContainer.removeEventListener("TabClose", this);
    this.window.gBrowser.removeProgressListener(this);
  }
}
