/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { Keymap } from "moz-src:///browser/components/modal/Keymap.sys.mjs";

const PREFS = ["browser.modal.enabled", "browser.modal.keybindings"];
const GROUPS = {
  address: ["urlbar"],
  editing: ["mode"],
  scrolling: ["scroll"],
  navigation: ["tab", "history"],
  find: ["find"],
  hints: ["hint"],
  other: [],
};

/** Render the active keymap only in the fork's otherwise empty new-tab page. */
export class ModalNewTabChild extends JSWindowActorChild {
  generation = 0;

  handleEvent() {
    if (
      this.document.documentURI !== "about:newtab" ||
      Services.prefs.getBoolPref("browser.newtabpage.enabled", true) ||
      this.onPreferenceChanged
    ) {
      return;
    }
    this.onPreferenceChanged = () => this.render().catch(console.error);
    for (const pref of PREFS) {
      Services.prefs.addObserver(pref, this.onPreferenceChanged);
    }
    this.onPreferenceChanged();
  }

  async render() {
    const generation = ++this.generation;
    const doc = this.document;
    if (!Services.prefs.getBoolPref("browser.modal.enabled", false)) {
      doc.getElementById("modal-shortcuts")?.remove();
      doc.getElementById("modal-shortcuts-style")?.remove();
      doc.title = "";
      return;
    }
    const bindings = Keymap.fromJSON(
      Services.prefs.getStringPref("browser.modal.keybindings", "{}")
    ).bindings;
    const commands = new Map();
    for (const [keys, command] of Object.entries(bindings)) {
      if (!commands.has(command)) {
        commands.set(command, []);
      }
      commands.get(command).push(keys);
    }
    const ids = [
      "modal-newtab-title",
      "modal-newtab-intro",
      "modal-newtab-tip",
      "modal-newtab-customized",
      ...Object.keys(GROUPS).map(group => `modal-newtab-group-${group}`),
      ...Array.from(
        commands.keys(),
        command => `modal-shortcut-${command.replaceAll(".", "-")}`
      ),
    ];
    const l10n = new Localization(["browser/modal.ftl"]);
    const messages = await l10n.formatValues(ids.map(id => ({ id })));
    if (generation !== this.generation) {
      return;
    }
    const strings = Object.fromEntries(ids.map((id, i) => [id, messages[i]]));
    const element = (tag, text) => {
      const node = doc.createElementNS("http://www.w3.org/1999/xhtml", tag);
      if (text !== undefined) {
        node.textContent = text;
      }
      return node;
    };
    const main = element("main");
    main.id = "modal-shortcuts";
    main.append(element("h1", messages[0]), element("p", messages[1]));
    const sections = new Map();
    for (const group of Object.keys(GROUPS)) {
      const section = element("section");
      section.dataset.group = group;
      section.append(
        element("h2", strings[`modal-newtab-group-${group}`]),
        element("dl")
      );
      sections.set(group, section);
    }
    for (const [command, sequences] of commands) {
      const prefix = command.split(".")[0];
      const group =
        Object.keys(GROUPS).find(name => GROUPS[name].includes(prefix)) ||
        "other";
      const list = sections.get(group).querySelector("dl");
      const row = element("div");
      row.dataset.command = command;
      const term = element("dt");
      sequences.forEach((sequence, i) => {
        if (i) {
          term.append(doc.createTextNode(" / "));
        }
        const key = element("kbd", sequence.replaceAll("C-", "Ctrl+"));
        key.dataset.keys = sequence;
        term.append(key);
      });
      row.append(
        term,
        element("dd", strings[`modal-shortcut-${command.replaceAll(".", "-")}`])
      );
      list.append(row);
    }
    for (const section of sections.values()) {
      if (section.querySelector("dt")) {
        main.append(section);
      }
    }
    main.append(element("p", messages[2]), element("p", messages[3]));
    const previous = doc.getElementById("modal-shortcuts");
    if (previous) {
      previous.replaceWith(main);
    } else {
      doc.body.append(main);
    }
    doc.title = messages[0];
    doc.documentElement.lang = Services.locale.appLocaleAsBCP47;
    doc.documentElement.dir = Services.locale.isAppLocaleRTL ? "rtl" : "ltr";
    if (!doc.getElementById("modal-shortcuts-style")) {
      const style = element("link");
      style.id = "modal-shortcuts-style";
      style.rel = "stylesheet";
      style.href = "chrome://browser/content/modal/newtab.css";
      doc.head.append(style);
    }
  }

  didDestroy() {
    this.generation++;
    if (this.onPreferenceChanged) {
      for (const pref of PREFS) {
        Services.prefs.removeObserver(pref, this.onPreferenceChanged);
      }
    }
  }
}
