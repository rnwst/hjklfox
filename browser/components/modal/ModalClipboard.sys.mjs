/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { BrowserUtils } from "resource://gre/modules/BrowserUtils.sys.mjs";

/** Copy and open page URLs through the system clipboard, with quiet errors. */
export class ModalClipboard {
  constructor(win) {
    this.window = win;
    this.version = 0;
    this.panel = null;
    this.timer = null;
    win.addEventListener("resize", this);
  }

  execute(command) {
    switch (command) {
      case "copy-url":
        this.copy();
        break;
      case "open-url":
      case "open-url-current":
        this.open(command === "open-url-current");
        break;
    }
  }

  copy() {
    this.hideError();
    const win = this.window;
    const browser = win.gBrowser.selectedBrowser;
    try {
      BrowserUtils.copyLink(
        win.gURLBar.makeURIReadable(browser.currentURI).displaySpec,
        browser.contentTitle
      );
    } catch {
      this.showError("modal-clipboard-copy-error").catch(console.error);
    }
  }

  readText() {
    const clipboard = Services.clipboard;
    if (
      !clipboard.hasDataMatchingFlavors(
        ["text/plain"],
        clipboard.kGlobalClipboard
      )
    ) {
      return "";
    }
    const transferable = Cc[
      "@mozilla.org/widget/transferable;1"
    ].createInstance(Ci.nsITransferable);
    transferable.init(this.window.docShell.QueryInterface(Ci.nsILoadContext));
    transferable.addDataFlavor("text/plain");
    clipboard.getData(transferable, clipboard.kGlobalClipboard);
    const data = {};
    transferable.getTransferData("text/plain", data);
    return data.value.QueryInterface(Ci.nsISupportsString).data;
  }

  open(current = false) {
    this.hideError();
    let text;
    try {
      text = this.readText().trim();
    } catch {
      this.showError("modal-clipboard-read-error").catch(console.error);
      return;
    }
    const url = URL.parse(text);
    if (!url) {
      this.showError("modal-clipboard-invalid-url").catch(console.error);
      return;
    }
    if (url.protocol === "javascript:") {
      this.showError("modal-clipboard-open-error").catch(console.error);
      return;
    }
    const win = this.window;
    const browser = win.gBrowser.selectedBrowser;
    try {
      win.openTrustedLinkIn(url.href, current ? "current" : "tab", {
        targetBrowser: current ? browser : undefined,
        userContextId: browser.browsingContext.originAttributes.userContextId,
        inBackground: false,
        allowInheritPrincipal: false,
        allowPinnedTabHostChange: true,
      });
    } catch {
      this.showError("modal-clipboard-open-error").catch(console.error);
    }
  }

  async showError(id) {
    this.hideError();
    const version = this.version;
    const doc = this.window.document;
    const message = await doc.l10n.formatValue(id);
    if (version !== this.version || this.window.closed) {
      return;
    }
    if (!this.panel) {
      this.panel = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
      this.panel.id = "modal-clipboard-error";
      this.panel.setAttribute("popover", "manual");
      this.panel.setAttribute("role", "alert");
      this.panel.setAttribute("aria-atomic", "true");
      doc.documentElement.append(this.panel);
    }
    this.panel.textContent = "";
    this.handleEvent();
    this.panel.showPopover();
    this.panel.textContent = message;
    this.timer = this.window.setTimeout(() => this.hideError(), 4000);
  }

  handleEvent() {
    this.panel?.style.setProperty(
      "--modal-key-popup-top",
      `${this.window.document.getElementById("nav-bar").getBoundingClientRect().bottom}px`
    );
  }

  hideError() {
    this.version++;
    this.window.clearTimeout(this.timer);
    this.timer = null;
    if (this.panel?.matches(":popover-open")) {
      this.panel.hidePopover();
    }
  }

  destroy() {
    this.hideError();
    this.window.removeEventListener("resize", this);
    this.panel?.remove();
    this.panel = null;
  }
}
