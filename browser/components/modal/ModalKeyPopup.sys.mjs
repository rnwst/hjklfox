/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/** Show pending key-sequence completions without taking focus from the page. */
export class ModalKeyPopup {
  constructor(win) {
    this.window = win;
    this.version = 0;
    this.panel = null;
    win.addEventListener("resize", this);
  }

  async update(keymap) {
    const version = ++this.version;
    const completions = keymap.completions();
    if (!completions.length) {
      this.hide();
      return;
    }
    const doc = this.window.document;
    if (!this.panel) {
      this.panel = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
      this.panel.id = "modal-key-completions";
      this.panel.setAttribute("popover", "manual");
      doc.documentElement.append(this.panel);
    }
    const element = tag =>
      doc.createElementNS("http://www.w3.org/1999/xhtml", tag);
    const content = element("div");
    content.className = "modal-key-completions-content";
    const title = element("h2");
    doc.l10n.setAttributes(title, "modal-key-completions-title", {
      prefix: keymap.prefix.replaceAll("C-", "Ctrl+"),
    });
    const list = element("dl");
    for (const { keys, command } of completions) {
      const row = element("div");
      row.dataset.keys = keys;
      const term = element("dt");
      const key = element("kbd");
      key.textContent = keys.replaceAll("C-", "Ctrl+");
      term.append(key);
      const description = element("dd");
      doc.l10n.setAttributes(
        description,
        `modal-shortcut-${command.replaceAll(".", "-")}`
      );
      row.append(term, description);
      list.append(row);
    }
    const help = element("p");
    doc.l10n.setAttributes(help, "modal-key-completions-cancel");
    content.append(title, list, help);
    this.panel.replaceChildren(content);
    await doc.l10n.translateFragment(content);
    if (version !== this.version || this.window.closed) {
      return;
    }
    if (!this.isOpen) {
      this.position();
      this.panel.showPopover();
    }
    this.updateBackdrop();
  }

  get isOpen() {
    return this.panel?.matches(":popover-open") || false;
  }

  position() {
    const toolbar = this.window.document.getElementById("nav-bar");
    this.panel.style.setProperty(
      "--modal-key-popup-top",
      `${toolbar.getBoundingClientRect().bottom}px`
    );
  }

  handleEvent() {
    if (this.isOpen) {
      this.position();
      this.updateBackdrop();
    }
  }

  updateBackdrop() {
    this.clearBackdrop();
    if (this.window.matchMedia("(forced-colors: active)").matches) {
      return;
    }
    const browser = this.window.gBrowser.selectedBrowser;
    const bounds = this.panel.getBoundingClientRect();
    const page = browser.getBoundingClientRect();
    try {
      this.backdropActor =
        browser.browsingContext.currentWindowGlobal.getActor("Modal");
      this.backdropActor.sendAsyncMessage("Modal:KeyBackdrop", {
        x: bounds.left - page.left,
        y: bounds.top - page.top,
        width: bounds.width,
        height: bounds.height,
        radius: parseFloat(
          this.window.getComputedStyle(this.panel).borderTopLeftRadius
        ),
        devicePixelRatio: this.window.devicePixelRatio,
      });
    } catch {
      this.backdropActor = null;
    }
  }

  clearBackdrop() {
    try {
      this.backdropActor?.sendAsyncMessage("Modal:KeyBackdrop", null);
    } catch {}
    this.backdropActor = null;
  }

  hide() {
    this.version++;
    this.clearBackdrop();
    if (this.isOpen) {
      this.panel.hidePopover();
    }
  }

  destroy() {
    this.hide();
    this.window.removeEventListener("resize", this);
    this.panel?.remove();
    this.panel = null;
  }
}
