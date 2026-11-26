/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export const DEFAULT_BINDINGS = Object.freeze({
  h: "key.left",
  j: "key.down",
  k: "key.up",
  l: "key.right",
  "C-u": "scroll.half-up",
  "C-d": "scroll.half-down",
  "C-f": "scroll.page-down",
  "C-b": "scroll.page-up",
  "/": "find.open",
  n: "find.next",
  N: "find.previous",
  "g g": "scroll.start",
  "g e": "scroll.end",
  "g h": "scroll.left-edge",
  "g l": "scroll.right-edge",
  "C-o": "history.back",
  "C-i": "history.forward",
  "g w": "hint.follow",
  "g W": "hint.follow-new-tab",
  i: "mode.insert",
  "Space f": "urlbar.destinations",
  "Space e": "urlbar.edit",
  "Space h": "urlbar.history",
  "Space m": "urlbar.bookmarks",
  "Space M": "bookmark.add",
  "Space b": "urlbar.tabs",
  "Space s": "urlbar.search",
  "Space y": "clipboard.copy-url",
  "Space p": "clipboard.open-url",
  "Space P": "clipboard.open-url-current",
  "t j": "tab.next",
  "t o": "tab.history-back",
  "t i": "tab.history-forward",
  "t n": "tab.new",
  "t N": "tab.new-before",
  "t u": "tab.reopen",
  "t q": "tab.close",
  "t v": "tab.select",
  "t ;": "tab.deselect",
  "t k": "tab.previous",
  "t J": "tab.move-next",
  "t K": "tab.move-previous",
  "t h": "tab.first",
  "t l": "tab.last",
  "t H": "tab.move-first",
  "t L": "tab.move-last",
  "t g n": "group.new",
  "t g m": "group.move",
  "t g u": "group.ungroup",
  "t g s": "group.select",
  "t g f": "group.fold",
  "t g F": "group.unfold",
  "t g e": "group.edit",
  "t g j": "tab.group-next",
  "t g k": "tab.group-previous",
  "t g J": "tab.group-move-next",
  "t g K": "tab.group-move-previous",
  "t g h": "tab.group-first",
  "t g l": "tab.group-last",
  "t g H": "tab.group-move-first",
  "t g L": "tab.group-move-last",
  "C-w n": "split.new",
  "C-w q": "split.separate",
});

export const SELECT_BINDINGS = Object.freeze({
  j: "selection.next",
  k: "selection.previous",
  h: "selection.first",
  l: "selection.last",
});

export const ALT_ARROW_BINDINGS = Object.freeze({
  "A-h": "key.left",
  "A-j": "key.down",
  "A-k": "key.up",
  "A-l": "key.right",
});

export const INSERT_BINDINGS = ALT_ARROW_BINDINGS;

export const ADDRESS_BINDINGS = Object.freeze({
  ...ALT_ARROW_BINDINGS,
  "C-Space": "address.engines",
});

export function keyToken(event, { allowAlt = false } = {}) {
  if (
    event.isComposing ||
    event.key === "Dead" ||
    event.key === "Process" ||
    (event.altKey && (!allowAlt || event.ctrlKey)) ||
    event.metaKey ||
    event.getModifierState?.("AltGraph")
  ) {
    return null;
  }
  const key =
    (event.ctrlKey || event.altKey) && !event.shiftKey
      ? event.key.toLowerCase()
      : event.key;
  return `${event.altKey ? "A-" : ""}${event.ctrlKey ? "C-" : ""}${key === " " ? "Space" : key}`;
}

/** Parse modal key sequences without depending on browser state. */
export class Keymap {
  static fromJSON(value) {
    let overrides = {};
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        overrides = parsed;
      }
    } catch {}
    return new Keymap(overrides);
  }

  constructor(overrides = {}, defaults = DEFAULT_BINDINGS) {
    this.bindings = { ...defaults };
    const commands = new Set(Object.values(defaults));
    for (const [sequence, command] of Object.entries(overrides)) {
      if (command === null) {
        delete this.bindings[sequence];
      } else if (commands.has(command)) {
        this.bindings[sequence] = command;
      }
    }
    this.reset();
  }

  reset() {
    this.prefix = "";
    this.count = "";
  }

  feed(token) {
    if (
      !this.prefix &&
      /^[0-9]$/.test(token) &&
      (this.count || token !== "0")
    ) {
      this.count = String(Math.min(999, Number(this.count + token)));
      return null;
    }
    const sequence = this.prefix ? `${this.prefix} ${token}` : token;
    const command = this.bindings[sequence];
    if (command) {
      const count = Number(this.count) || 1;
      this.reset();
      return { command, count };
    }
    if (
      Object.keys(this.bindings).some(key => key.startsWith(`${sequence} `))
    ) {
      this.prefix = sequence;
    } else {
      this.reset();
    }
    return null;
  }

  accepts(token) {
    const candidate = this.prefix ? `${this.prefix} ${token}` : token;
    return Object.keys(this.bindings).some(
      sequence => sequence === candidate || sequence.startsWith(`${candidate} `)
    );
  }

  completions() {
    if (!this.prefix) {
      return [];
    }
    const prefix = `${this.prefix} `;
    return Object.entries(this.bindings)
      .filter(([sequence]) => sequence.startsWith(prefix))
      .map(([sequence, command]) => ({
        keys: sequence.slice(prefix.length),
        command,
      }));
  }
}

export function hintLabels(count, alphabet = "asdfghjkl") {
  const width = Math.max(
    1,
    Math.ceil(Math.log(Math.max(1, count)) / Math.log(alphabet.length))
  );
  return Array.from({ length: count }, (_, index) => {
    let label = "";
    for (let digit = 0; digit < width; digit++) {
      label = alphabet[index % alphabet.length] + label;
      index = Math.floor(index / alphabet.length);
    }
    return label;
  });
}
