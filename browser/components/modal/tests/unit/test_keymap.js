/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { Keymap, hintLabels, keyToken, SELECT_BINDINGS } =
  ChromeUtils.importESModule(
    "moz-src:///browser/components/modal/Keymap.sys.mjs"
  );

add_task(function sequences_and_counts() {
  const keys = new Keymap();
  Assert.equal(keys.feed("3"), null);
  Assert.equal(keys.feed("t"), null);
  Assert.deepEqual(keys.feed("j"), { command: "tab.next", count: 3 });
  keys.feed("g");
  keys.feed("z");
  Assert.deepEqual(keys.feed("j"), { command: "key.down", count: 1 });
  keys.feed("2");
  keys.reset();
  Assert.deepEqual(keys.feed("k"), { command: "key.up", count: 1 });
});

add_task(function page_search_navigation_uses_n_and_N() {
  const keys = new Keymap();
  Assert.equal(keys.feed("n").command, "find.next");
  Assert.equal(keys.feed("N").command, "find.previous");
  Assert.equal(keys.feed("p"), null);
});

add_task(function tab_prefixes_have_no_terminal_conflicts() {
  const keys = new Keymap({ "t t": "group.pick" });
  const bindings = Object.keys(keys.bindings);
  Assert.ok(
    !bindings.includes("t t"),
    "The removed group picker cannot be rebound"
  );
  for (const sequence of bindings) {
    Assert.ok(
      !bindings.some(other => other.startsWith(`${sequence} `)),
      `${sequence} does not mask a longer command`
    );
  }
  for (const sequence of ["g n", "g p", "g N", "g P", "t m", "t t"]) {
    Assert.ok(
      !bindings.includes(sequence),
      `${sequence} is no longer a default binding`
    );
  }
});

add_task(function selection_counts_do_not_dispatch_page_scroll_commands() {
  const keys = new Keymap({}, SELECT_BINDINGS);
  keys.feed("5");
  Assert.deepEqual(keys.feed("j"), { command: "selection.next", count: 5 });
  Assert.deepEqual(keys.feed("k"), { command: "selection.previous", count: 1 });
  Assert.equal(keys.feed("i"), null);
});

add_task(function bindings_and_modifiers() {
  const keys = new Keymap({ j: null, "g t": "tab.next", z: "not-a-command" });
  Assert.equal(keys.feed("j"), null);
  keys.feed("g");
  Assert.equal(keys.feed("t").command, "tab.next");
  Assert.equal(keys.feed("z"), null);
  Assert.equal(keyToken({ key: "i", ctrlKey: true }), "C-i");
  Assert.equal(keyToken({ key: "O", ctrlKey: true, shiftKey: false }), "C-o");
  Assert.equal(keyToken({ key: "O", ctrlKey: true, shiftKey: true }), "C-O");
  Assert.equal(keyToken({ key: " " }), "Space");
  Assert.equal(keyToken({ key: "Tab" }), "Tab");
  Assert.equal(keyToken({ key: "a", isComposing: true }), null);
  Assert.equal(keyToken({ key: "Dead" }), null);
  Assert.equal(keyToken({ key: "a", altKey: true, ctrlKey: true }), null);
});

add_task(function new_tab_hints_use_uppercase_w() {
  const keys = new Keymap();
  keys.feed("g");
  Assert.equal(
    keys.feed(keyToken({ key: "W", shiftKey: true })).command,
    "hint.follow-new-tab"
  );
  keys.feed("g");
  Assert.equal(keys.feed("w").command, "hint.follow");
});

add_task(function shared_preference_parsing() {
  const defaults = new Keymap().bindings;
  for (const value of ["invalid", "null", "[]", "true"]) {
    Assert.deepEqual(Keymap.fromJSON(value).bindings, defaults);
  }
  const keys = Keymap.fromJSON('{"j":null,"z":"key.down"}');
  Assert.equal(keys.feed("j"), null);
  Assert.deepEqual(keys.feed("z"), { command: "key.down", count: 1 });
});

add_task(function prefix_completions_follow_overrides() {
  const keys = new Keymap({
    "Space f": null,
    "Space q t": "urlbar.tabs",
  });
  Assert.deepEqual(keys.completions(), []);
  keys.feed("Space");
  Assert.ok(!keys.completions().some(item => item.keys === "f"));
  Assert.ok(keys.completions().some(item => item.keys === "q t"));
  keys.feed("q");
  Assert.deepEqual(keys.completions(), [{ keys: "t", command: "urlbar.tabs" }]);
  Assert.equal(keys.feed("t").command, "urlbar.tabs");
  Assert.deepEqual(keys.completions(), []);
  keys.feed("g");
  Assert.ok(keys.completions().some(item => item.command === "hint.follow"));
  keys.feed("z");
  Assert.deepEqual(keys.completions(), []);
});

add_task(function labels_are_unique_and_prefix_free() {
  for (const count of [0, 1, 9, 10, 81, 82, 1000]) {
    const labels = hintLabels(count);
    Assert.equal(labels.length, count);
    Assert.equal(new Set(labels).size, count);
    Assert.ok(labels.every(label => label.length === labels[0].length));
  }
});
