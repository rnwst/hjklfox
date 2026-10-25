/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export const DEFAULT_BINDINGS = Object.freeze({
  h: "scroll.left",
  j: "scroll.down",
  k: "scroll.up",
  l: "scroll.right",
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
  "g n": "tab.next",
  "g p": "tab.previous",
  "C-o": "history.back",
  "C-i": "history.forward",
  "g w": "hint.follow",
  i: "mode.insert",
});

export function keyToken(event) {
  if (
    event.isComposing ||
    event.key === "Dead" ||
    event.key === "Process" ||
    event.altKey ||
    event.metaKey ||
    event.getModifierState?.("AltGraph")
  ) {
    return null;
  }
  const key =
    event.ctrlKey && !event.shiftKey ? event.key.toLowerCase() : event.key;
  return `${event.ctrlKey ? "C-" : ""}${key === " " ? "Space" : key}`;
}

/** Parse modal key sequences without depending on browser state. */
export class Keymap {
  constructor(overrides = {}) {
    this.bindings = { ...DEFAULT_BINDINGS };
    const commands = new Set(Object.values(DEFAULT_BINDINGS));
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
