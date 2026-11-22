/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global gModalNavigation */

async function splitKey(key) {
  EventUtils.synthesizeKey("w", { ctrlKey: true });
  EventUtils.synthesizeKey(key);
}

add_task(async function native_split_picker_is_ready_for_typing() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.tabs.splitView.enabled", true]],
  });
  const source = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:blank"
  );
  const target = BrowserTestUtils.addTab(gBrowser, "about:robots");
  let picker;
  try {
    await BrowserTestUtils.browserLoaded(target.linkedBrowser);
    gModalNavigation.enterCommand();
    const opened = BrowserTestUtils.waitForNewTab(gBrowser, "about:opentabs");
    await splitKey("n");
    picker = await opened;
    Assert.equal(
      source.splitview,
      picker.splitview,
      "The native split contains the source and picker"
    );
    const doc = picker.linkedBrowser.contentDocument;
    const component = await TestUtils.waitForCondition(
      () => doc.querySelector("splitview-opentabs")?.searchTextbox?.inputEl
    );
    await TestUtils.waitForCondition(
      () =>
        component ===
        Services.focus.getFocusedElementForWindow(
          picker.linkedBrowser.contentWindow,
          true,
          {}
        )
    );
    Assert.equal(
      gModalNavigation.mode,
      "insert",
      "The native picker starts in insert mode"
    );
    await splitKey("q");
    Assert.ok(
      source.splitview,
      "Ctrl-w q cannot separate a split in insert mode"
    );
    EventUtils.synthesizeKey("a", { accelKey: true });
    EventUtils.synthesizeKey("KEY_Backspace");
    EventUtils.sendString("about:robots");
    const host = doc.querySelector("splitview-opentabs");
    await TestUtils.waitForCondition(() => host.searchQuery === "about:robots");
    await TestUtils.waitForCondition(
      () => host.sidebarTabList?.rowEls?.length === 1
    );
    const row = host.sidebarTabList.rowEls[0];
    EventUtils.synthesizeKey("KEY_Tab");
    await TestUtils.waitForCondition(() => row.matches(":focus-within"));
    Assert.ok(
      row.matches(":focus-within"),
      "Keyboard traversal reaches the matching native tab row"
    );
    EventUtils.synthesizeKey("KEY_Enter");
    await TestUtils.waitForCondition(() =>
      source.splitview?.tabs.includes(target)
    );
    Assert.ok(!picker.isOpen, "Choosing a tab replaces the native picker");
    await TestUtils.waitForCondition(() => gModalNavigation.mode === "command");
    await splitKey("q");
    await TestUtils.waitForCondition(
      () => !source.splitview && !target.splitview
    );
    Assert.ok(
      source.isOpen && target.isOpen,
      "Separating a split keeps both tabs open"
    );
  } finally {
    source.splitview?.unsplitTabs();
    for (const tab of [source, target, picker]) {
      if (tab?.isOpen) {
        await BrowserTestUtils.removeTab(tab);
      }
    }
    await SpecialPowers.popPrefEnv();
  }
});

add_task(async function escape_cancels_delayed_picker_focus() {
  const source = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:blank"
  );
  let picker;
  try {
    gModalNavigation.enterCommand();
    const opened = BrowserTestUtils.waitForNewTab(gBrowser, "about:opentabs");
    await splitKey("n");
    EventUtils.synthesizeKey("KEY_Escape");
    picker = await opened;
    const doc = picker.linkedBrowser.contentDocument;
    const input = await TestUtils.waitForCondition(
      () => doc.querySelector("splitview-opentabs")?.searchTextbox?.inputEl
    );
    await TestUtils.waitForTick();
    Assert.equal(
      gModalNavigation.mode,
      "command",
      "Loading the picker does not undo Escape"
    );
    Assert.notEqual(
      Services.focus.getFocusedElementForWindow(
        picker.linkedBrowser.contentWindow,
        true,
        {}
      ),
      input,
      "The canceled request does not focus the search field"
    );
    await splitKey("q");
    await TestUtils.waitForCondition(() => !source.splitview);
    Assert.ok(
      !picker.isOpen,
      "Separating an unfinished split removes the temporary picker"
    );
    Assert.ok(source.isOpen);
  } finally {
    source.splitview?.unsplitTabs();
    for (const tab of [source, picker]) {
      if (tab?.isOpen) {
        await BrowserTestUtils.removeTab(tab);
      }
    }
  }
});
