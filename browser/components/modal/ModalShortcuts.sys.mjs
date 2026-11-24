/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/** Suspend browser keysets, without cancelling page input or editing defaults. */
export class ModalShortcuts {
  constructor(win) {
    this.document = win.document;
    this.saved = new Map();
    this.blocked = false;
    this.observer = new win.MutationObserver(() => this.update());
    this.observer.observe(this.document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  setBlocked(blocked) {
    this.blocked = blocked;
    this.update();
  }

  update() {
    if (this.blocked) {
      for (const keyset of this.document.querySelectorAll("keyset")) {
        if (!this.saved.has(keyset)) {
          this.saved.set(keyset, keyset.getAttribute("disabled"));
          keyset.setAttribute("disabled", "true");
        }
      }
      return;
    }
    for (const [keyset, disabled] of this.saved) {
      if (disabled === null) {
        keyset.removeAttribute("disabled");
      } else {
        keyset.setAttribute("disabled", disabled);
      }
    }
    this.saved.clear();
  }

  destroy() {
    this.observer.disconnect();
    this.setBlocked(false);
  }
}
