/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const HINT_TARGETS = "a[href], button";

/** Frame-local editing, scrolling, and anonymous page-hint overlays. */
export class ModalChild extends JSWindowActorChild {
  targets = [];
  targetKeys = [];
  overlay = null;
  overlayDocument = null;
  keyBackdrop = null;
  keyBackdropDocument = null;
  generation = null;
  newTabHint = false;
  lastEditor = null;
  pointerFocusPending = false;
  prefix = "";
  refreshFrame = null;
  mutationObserver = null;
  needsRetarget = false;

  isEditable(element) {
    return (
      element?.isContentEditable ||
      (element?.matches?.("textarea, input") &&
        !element.readOnly &&
        !element.disabled &&
        ![
          "button",
          "checkbox",
          "radio",
          "submit",
          "reset",
          "file",
          "image",
          "hidden",
          "range",
          "color",
        ].includes(element.type))
    );
  }

  handleEvent(event) {
    if (!event.isTrusted) {
      return;
    }
    const target = event.composedPath()[0];
    switch (event.type) {
      case "pointerdown":
        this.pointerFocusPending = event.button === 0;
        this.contentWindow.setTimeout(() => {
          this.pointerFocusPending = false;
        }, 0);
        if (event.button === 0 && this.isEditable(target)) {
          this.lastEditor = target;
          this.sendAsyncMessage("Modal:Insert", { reason: "pointer" });
        }
        break;
      case "focus": {
        const method = Services.focus.getLastFocusMethod(this.contentWindow);
        if (
          this.isEditable(target) &&
          (method & Ci.nsIFocusManager.FLAG_BYKEY ||
            (method & Ci.nsIFocusManager.FLAG_BYMOUSE &&
              this.pointerFocusPending))
        ) {
          this.lastEditor = target;
          this.sendAsyncMessage("Modal:Insert", {
            reason:
              method & Ci.nsIFocusManager.FLAG_BYKEY ? "keyboard" : "pointer",
          });
        }
        break;
      }
      case "pageshow":
        this.sendAsyncMessage("Modal:PageShow");
        break;
      case "pagehide":
        this.setKeyBackdrop(null);
        if (this.generation !== null) {
          this.sendAsyncMessage("Modal:FrameGone", {
            generation: this.generation,
          });
          this.clear();
        }
        break;
      case "scroll":
      case "resize":
      case "load":
        this.scheduleRefresh();
        break;
    }
  }

  receiveMessage({ name, data }) {
    switch (name) {
      case "Modal:KeyBackdrop":
        this.setKeyBackdrop(data);
        break;
      case "Modal:Blur": {
        const element = Services.focus.getFocusedElementForWindow(
          this.contentWindow,
          true,
          {}
        );
        if (this.isEditable(element)) {
          this.lastEditor = element;
          element.blur();
        }
        break;
      }
      case "Modal:Insert": {
        const focused = Services.focus.getFocusedElementForWindow(
          this.contentWindow,
          true,
          {}
        );
        if (
          (!focused ||
            focused === this.document.body ||
            focused === this.document.documentElement) &&
          this.lastEditor?.isConnected
        ) {
          this.lastEditor.focus();
        }
        break;
      }
      case "Modal:Scroll":
        this.scroll(data);
        break;
      case "Modal:Collect":
        this.clear();
        this.generation = data.generation;
        this.newTabHint = !!data.newTab;
        if (this.document.visibilityState === "hidden") {
          return 0;
        }
        for (const element of this.document.querySelectorAll(
          this.newTabHint ? "a[href]" : HINT_TARGETS
        )) {
          if (this.point(element)) {
            this.targets.push(element);
            if (this.targets.length === 1000) {
              break;
            }
          }
        }
        this.targetKeys = this.targets.map(target => this.targetKey(target));
        return this.targets.length;
      case "Modal:Show":
        if (data.generation === this.generation) {
          this.show(data.labels, data.title, data.buttonName);
        }
        break;
      case "Modal:Filter":
        if (data.generation === this.generation) {
          this.prefix = data.prefix;
          this.refresh();
        }
        break;
      case "Modal:Activate": {
        if (data.generation !== this.generation) {
          break;
        }
        const target = this.targets[data.index];
        const newTab = this.newTabHint;
        const point =
          !newTab || target?.matches("a[href]") ? this.point(target) : null;
        this.clear();
        if (point) {
          for (const type of ["mousedown", "mouseup"]) {
            this.contentWindow.synthesizeMouseEvent(type, point.x, point.y, {
              button: newTab ? 1 : 0,
              clickCount: 1,
              inputSource: this.contentWindow.MouseEvent.MOZ_SOURCE_MOUSE,
            });
          }
        }
        break;
      }
      case "Modal:Clear":
        this.clear();
        break;
    }
    return null;
  }

  point(element) {
    if (
      !element?.isConnected ||
      element.matches(":disabled") ||
      element.getAttribute("aria-disabled") === "true" ||
      element.closest("[inert]") ||
      !element.checkVisibility({
        visibilityProperty: true,
        opacityProperty: true,
      })
    ) {
      return null;
    }
    for (const rect of element.getClientRects()) {
      const left = Math.max(0, rect.left);
      const top = Math.max(0, rect.top);
      const right = Math.min(this.contentWindow.innerWidth, rect.right);
      const bottom = Math.min(this.contentWindow.innerHeight, rect.bottom);
      if (right <= left || bottom <= top) {
        continue;
      }
      const x = (left + right) / 2;
      const y = (top + bottom) / 2;
      if (element.contains(this.document.elementFromPoint(x, y))) {
        return { x, y, left, top };
      }
    }
    return null;
  }

  setKeyBackdrop(bounds) {
    if (this.keyBackdrop) {
      try {
        this.keyBackdropDocument.removeAnonymousContent(this.keyBackdrop);
      } catch {}
      this.keyBackdrop = null;
      this.keyBackdropDocument = null;
    }
    if (!bounds || this.document.visibilityState === "hidden") {
      return;
    }
    const scale = bounds.devicePixelRatio / this.contentWindow.devicePixelRatio;
    this.keyBackdropDocument = this.document;
    this.keyBackdrop = this.document.insertAnonymousContent();
    const root = this.keyBackdrop.root;
    const stylesheet = this.document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "link"
    );
    stylesheet.rel = "stylesheet";
    stylesheet.href = "chrome://browser/content/modal/hints.css";
    const backdrop = this.document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "div"
    );
    backdrop.className = "modal-key-backdrop";
    for (const [property, value] of Object.entries({
      left: bounds.x,
      top: bounds.y,
      width: bounds.width,
      height: bounds.height,
      borderRadius: bounds.radius,
    })) {
      backdrop.style[property] = `${value * scale}px`;
    }
    backdrop.style.setProperty("--modal-backdrop-blur", `${8 * scale}px`);
    root.append(stylesheet, backdrop);
  }

  linkURL(element) {
    try {
      return new URL(element.getAttribute("href"), this.document.baseURI).href;
    } catch {
      return element.getAttribute("href");
    }
  }

  targetKey(element) {
    if (element.matches("a[href]")) {
      return `link:${this.linkURL(element)}`;
    }
    return element.id ? `button:${element.id}` : null;
  }

  targetName(target) {
    const fallback = target.matches("a[href]")
      ? this.linkURL(target)
      : this.buttonName;
    return (
      target.getAttribute("aria-label") ||
      target.textContent.trim() ||
      target.querySelector("img[alt]")?.alt ||
      target.getAttribute("title") ||
      fallback
    ).slice(0, 160);
  }

  show(labels, title, buttonName) {
    if (!labels.length) {
      return;
    }
    this.buttonName = buttonName;
    const positions = this.targets.map(target => this.point(target));
    this.overlayDocument = this.document;
    this.overlay = this.document.insertAnonymousContent();
    const root = this.overlay.root;
    const createElement = name =>
      this.document.createElementNS("http://www.w3.org/1999/xhtml", name);
    const stylesheet = createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.href = "chrome://browser/content/modal/hints.css";
    root.appendChild(stylesheet);
    const group = createElement("div");
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", title);
    root.appendChild(group);
    labels.forEach((text, index) => {
      const point = positions[index];
      const label = createElement("span");
      label.className = "hint";
      label.dataset.index = index;
      label.dataset.label = text;
      label.textContent = text;
      const target = this.targets[index];
      const description = createElement("span");
      description.className = "hint-target";
      description.textContent = `: ${this.targetName(target)}`;
      label.appendChild(description);
      label.hidden = !point;
      if (point) {
        label.style.left = `${point.left}px`;
        label.style.top = `${point.top}px`;
      }
      group.appendChild(label);
    });
    this.mutationObserver = new this.contentWindow.MutationObserver(records => {
      this.needsRetarget ||= records.some(
        record => record.type === "childList"
      );
      this.scheduleRefresh();
    });
    this.mutationObserver.observe(this.document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
    this.needsRetarget = true;
    this.scheduleRefresh();
  }

  scheduleRefresh() {
    if (!this.overlay || this.refreshFrame !== null) {
      return;
    }
    this.refreshFrame = this.contentWindow.requestAnimationFrame(() => {
      this.refreshFrame = null;
      this.refresh();
    });
  }

  refresh() {
    if (
      this.needsRetarget &&
      this.targets.some(target => !target.isConnected)
    ) {
      const used = new Set(this.targets.filter(target => target.isConnected));
      const replacements = new Map();
      for (const target of this.document.querySelectorAll(HINT_TARGETS)) {
        const key = this.targetKey(target);
        if (key && !used.has(target) && this.point(target)) {
          if (!replacements.has(key)) {
            replacements.set(key, []);
          }
          replacements.get(key).push(target);
        }
      }
      this.targets = this.targets.map((target, index) => {
        if (target.isConnected) {
          return target;
        }
        const options = replacements.get(this.targetKeys[index]);
        if (!options?.length) {
          return target;
        }
        const exact = options.findIndex(
          item => item.textContent === target.textContent
        );
        return options.splice(Math.max(0, exact), 1)[0];
      });
    }
    this.needsRetarget = false;
    const labels = Array.from(
      this.overlay?.root.querySelectorAll(".hint") || []
    );
    const positions = labels.map(label =>
      this.point(this.targets[Number(label.dataset.index)])
    );
    labels.forEach((label, index) => {
      const position = positions[index];
      label.hidden = !position || !label.dataset.label.startsWith(this.prefix);
      if (position) {
        label.style.left = `${position.left}px`;
        label.style.top = `${position.top}px`;
        const description = label.querySelector(".hint-target");
        const name = `: ${this.targetName(this.targets[Number(label.dataset.index)])}`;
        if (description.textContent !== name) {
          description.textContent = name;
        }
      }
    });
  }

  scroll({ command, count }) {
    let target = Services.focus.getFocusedElementForWindow(
      this.contentWindow,
      true,
      {}
    );
    const horizontal = [
      "scroll.left",
      "scroll.right",
      "scroll.left-edge",
      "scroll.right-edge",
    ].includes(command);
    while (target && target !== this.document.scrollingElement) {
      const style = this.contentWindow.getComputedStyle(target);
      if (
        horizontal
          ? target.scrollWidth > target.clientWidth &&
            /auto|scroll/.test(style.overflowX)
          : target.scrollHeight > target.clientHeight &&
            /auto|scroll/.test(style.overflowY)
      ) {
        break;
      }
      target = target.parentElement;
    }
    target ||= this.document.scrollingElement;
    if (!target) {
      return;
    }
    const distance = 60 * count;
    switch (command) {
      case "scroll.left":
        target.scrollBy({ left: -distance });
        break;
      case "scroll.right":
        target.scrollBy({ left: distance });
        break;
      case "scroll.up":
        target.scrollBy({ top: -distance });
        break;
      case "scroll.down":
        target.scrollBy({ top: distance });
        break;
      case "scroll.half-up":
        target.scrollBy({ top: (-target.clientHeight * count) / 2 });
        break;
      case "scroll.half-down":
        target.scrollBy({ top: (target.clientHeight * count) / 2 });
        break;
      case "scroll.page-up":
        target.scrollBy({ top: -target.clientHeight * count });
        break;
      case "scroll.page-down":
        target.scrollBy({ top: target.clientHeight * count });
        break;
      case "scroll.start":
        target.scrollTo({ top: 0 });
        break;
      case "scroll.end":
        target.scrollTo({ top: target.scrollHeight });
        break;
      case "scroll.left-edge":
        target.scrollTo({ left: 0 });
        break;
      case "scroll.right-edge":
        target.scrollTo({ left: target.scrollWidth });
        break;
    }
  }

  clear() {
    this.mutationObserver?.disconnect();
    this.mutationObserver = null;
    if (this.refreshFrame !== null) {
      this.overlayDocument?.defaultView?.cancelAnimationFrame(
        this.refreshFrame
      );
      this.refreshFrame = null;
    }
    this.prefix = "";
    this.needsRetarget = false;
    if (this.overlay) {
      try {
        this.overlayDocument.removeAnonymousContent(this.overlay);
      } catch {}
      this.overlay = null;
    }
    this.overlayDocument = null;
    this.targets = [];
    this.targetKeys = [];
    this.generation = null;
    this.newTabHint = false;
  }

  didDestroy() {
    this.setKeyBackdrop(null);
    this.clear();
    this.lastEditor = null;
  }
}
