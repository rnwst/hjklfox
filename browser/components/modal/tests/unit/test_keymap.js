/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { Keymap, hintLabels, keyToken } = ChromeUtils.importESModule(
  "moz-src:///browser/components/modal/Keymap.sys.mjs"
);

add_task(function sequences_and_counts() {
  const keys = new Keymap();
  Assert.equal(keys.feed("3"), null);
  Assert.equal(keys.feed("g"), null);
  Assert.deepEqual(keys.feed("n"), { command: "tab.next", count: 3 });
  keys.feed("g");
  keys.feed("z");
  Assert.deepEqual(keys.feed("j"), { command: "scroll.down", count: 1 });
  keys.feed("2");
  keys.reset();
  Assert.deepEqual(keys.feed("k"), { command: "scroll.up", count: 1 });
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

add_task(function labels_are_unique_and_prefix_free() {
  for (const count of [0, 1, 9, 10, 81, 82, 1000]) {
    const labels = hintLabels(count);
    Assert.equal(labels.length, count);
    Assert.equal(new Set(labels).size, count);
    Assert.ok(labels.every(label => label.length === labels[0].length));
  }
});
