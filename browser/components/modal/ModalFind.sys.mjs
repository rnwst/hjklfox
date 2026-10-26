/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/** Keep native page finding explicit, with Enter committing the current draft. */
export class ModalFind {
  constructor(controller) {
    this.controller = controller;
    this.window = controller.window;
    this.version = 0;
    this.opening = false;
    this.submitted = null;
    for (const type of [
      "find",
      "findagain",
      "findhighlightallchange",
      "findbarclose",
    ]) {
      this.window.addEventListener(type, this, true);
    }
  }

  handleEvent(event) {
    const bar = event.target;
    if (
      !this.controller.enabled ||
      bar.localName !== "findbar" ||
      bar.ownerDocument !== this.window.document
    ) {
      return;
    }
    if (event.type === "findbarclose") {
      bar._keepFindbarUnfocused = true;
      bar.browser.finder.removeSelection();
    } else if (event.type === "find" && this.allowFind !== bar) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.cancelPrefill(bar);
    } else if (event.type === "findagain" && this.allowAgain !== bar) {
      event.preventDefault();
      event.stopImmediatePropagation();
    } else if (event.type === "findhighlightallchange") {
      const query = bar.browser._lastSearchString;
      event.detail.query = query || "";
      event.preventDefault();
      if (
        bar.browser.contentPrincipal?.spec ===
        "resource://pdf.js/web/viewer.html"
      ) {
        return;
      }
      if (query) {
        bar.browser.finder.highlight(bar._highlightAll, query, false);
      }
    }
  }

  async open() {
    const version = ++this.version;
    const tab = this.window.gBrowser.selectedTab;
    this.opening = true;
    this.submitted = null;
    try {
      const bar = await this.window.gBrowser.getFindBar(tab);
      if (
        version === this.version &&
        this.controller.enabled &&
        tab === this.window.gBrowser.selectedTab
      ) {
        await bar.onFindCommand();
      }
    } finally {
      if (version === this.version) {
        this.opening = false;
      }
    }
  }

  cancelPrefill(bar) {
    bar._startFindDeferred?.resolve();
    bar._startFindDeferred = null;
  }

  updateOptions(enabled = this.controller.enabled) {
    const activeBar = this.controller.activeElement?.closest("findbar");
    for (const control of this.window.document.querySelectorAll(
      "findbar checkbox"
    )) {
      control.disabled =
        enabled &&
        (this.controller.mode !== "search" ||
          control.closest("findbar") !== activeBar);
    }
  }

  isSubmitKey(event, element) {
    return (
      this.controller.isFindBarFocus(element) &&
      !element.closest("findbar")._isIMEComposing &&
      event.key === "Enter" &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.metaKey
    );
  }

  blocksAccessKey(event) {
    if (
      !event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      this.controller.isFindBarFocus() ||
      !this.window.gFindBarInitialized
    ) {
      return false;
    }
    const bar = this.window.gFindBar;
    return (
      !bar.hidden &&
      [...bar.querySelectorAll("[accesskey]")].some(
        control =>
          control.getAttribute("accesskey").toLowerCase() ===
          event.key.toLowerCase()
      )
    );
  }

  submit(bar) {
    this.cancelPrefill(bar);
    bar._keepFindbarUnfocused = true;
    const signature = JSON.stringify([
      bar.browser.browsingContext.currentWindowGlobal?.innerWindowId,
      bar._findField.value,
      bar._typeAheadCaseSensitive,
      bar._matchDiacritics,
      bar._entireWord,
    ]);
    if (this.submitted?.bar === bar && this.submitted.signature === signature) {
      return;
    }
    this.submitted = { bar, signature };
    bar.browser._lastSearchString = bar._findField.value;
    this.allowFind = bar;
    try {
      bar._findFailedString = null;
      bar._find(bar._findField.value);
    } finally {
      this.allowFind = null;
    }
  }

  again(previous) {
    if (!this.window.gFindBarInitialized) {
      return;
    }
    const bar = this.window.gFindBar;
    const query = bar.browser._lastSearchString;
    if (bar.hidden || !query) {
      return;
    }
    bar._findField.value = query;
    this.allowFind = this.allowAgain = bar;
    try {
      bar.onFindAgainCommand(previous);
    } finally {
      this.allowFind = this.allowAgain = null;
    }
  }

  close() {
    this.cancel();
    if (!this.window.gFindBarInitialized) {
      return;
    }
    const bar = this.window.gFindBar;
    this.cancelPrefill(bar);
    bar._findField.value = bar.browser._lastSearchString || "";
    bar.close(true);
  }

  cancel() {
    this.version++;
    this.opening = false;
    this.submitted = null;
  }

  destroy() {
    this.cancel();
    this.updateOptions(false);
    for (const type of [
      "find",
      "findagain",
      "findhighlightallchange",
      "findbarclose",
    ]) {
      this.window.removeEventListener(type, this, true);
    }
  }
}
