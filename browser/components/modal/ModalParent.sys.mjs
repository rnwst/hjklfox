/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/** Accept page focus notifications only from the selected, current document. */
export class ModalParent extends JSWindowActorParent {
  actorCreated() {
    this.topLevel = !this.browsingContext.parent;
  }

  trackHints(controller, generation) {
    this.hintOwner = new WeakRef(controller);
    this.hintGeneration = generation;
  }

  receiveMessage({ name, data }) {
    if (name === "Modal:FrameGone") {
      this.hintOwner
        ?.deref()
        ?.removeHintFrame(this, data.generation, this.topLevel);
      return;
    }
    const browser = this.browsingContext.top.embedderElement;
    const win = browser?.documentGlobal;
    if (browser !== win?.gBrowser?.selectedBrowser) {
      return;
    }
    const controller = win?.gModalNavigation;
    if (!controller?.enabled) {
      return;
    }
    if (this.manager !== this.browsingContext.currentWindowGlobal) {
      return;
    }
    if (name === "Modal:Insert") {
      if (
        data.reason === "pointer" ||
        (data.reason === "keyboard" && controller.tabFocusPending)
      ) {
        controller.setMode("insert");
      }
    } else if (name === "Modal:PageShow") {
      if (!this.browsingContext.parent) {
        controller.noteDocument();
      }
    }
  }

  didDestroy() {
    this.hintOwner
      ?.deref()
      ?.removeHintFrame(this, this.hintGeneration, this.topLevel);
    this.hintOwner = null;
  }
}
