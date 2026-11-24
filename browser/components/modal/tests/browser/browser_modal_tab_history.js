/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global gModalNavigation */

const HISTORY_PAGE =
  "https://example.com/browser/browser/components/modal/tests/browser/keyboard.html";

async function keys(sequence, win = window) {
  for (const key of sequence) {
    EventUtils.synthesizeKey(key, { shiftKey: /^[A-Z]$/.test(key) }, win);
  }
  await TestUtils.waitForTick();
}

async function selectTab(tab) {
  await BrowserTestUtils.switchTab(gBrowser, tab);
  gModalNavigation.enterCommand();
}

async function withTabs(count, task, url = "about:blank") {
  const tabs = [];
  try {
    for (let i = 0; i < count; i++) {
      tabs.push(await BrowserTestUtils.openNewForegroundTab(gBrowser, url));
    }
    await selectTab(tabs[0]);
    gModalNavigation.tabs.resetHistory(tabs[0]);
    await task(tabs);
  } finally {
    gModalNavigation.enterCommand();
    for (const tab of tabs) {
      if (tab.isOpen) {
        await BrowserTestUtils.removeTab(tab);
      }
    }
  }
}

add_task(async function visits_counts_and_branching() {
  await withTabs(4, async ([a, b, c, d]) => {
    const background = BrowserTestUtils.addTab(gBrowser, "about:blank");
    try {
      await keys("to");
      Assert.equal(gBrowser.selectedTab, a, "Background tabs add no visits");
      EventUtils.synthesizeMouseAtCenter(b, {});
      await TestUtils.waitForCondition(() => gBrowser.selectedTab === b);
      EventUtils.synthesizeKey("KEY_PageDown", { ctrlKey: true });
      await TestUtils.waitForCondition(() => gBrowser.selectedTab === c);
      await keys("to");
      Assert.equal(gBrowser.selectedTab, b, "Native shortcuts record visits");
      await keys("tj");
      Assert.equal(gBrowser.selectedTab, c);
      await keys("to");
      Assert.equal(gBrowser.selectedTab, b, "Modal switching records a visit");
      await keys("to");
      Assert.equal(gBrowser.selectedTab, a, "Mouse switching records a visit");
      await keys("ti");
      Assert.equal(gBrowser.selectedTab, b);

      await selectTab(a);
      await selectTab(c);
      await keys("to");
      Assert.equal(gBrowser.selectedTab, a);
      await keys("to");
      Assert.equal(gBrowser.selectedTab, b, "Repeated visits remain distinct");
      await keys("to");
      Assert.equal(gBrowser.selectedTab, a);
      await keys("to");
      Assert.equal(gBrowser.selectedTab, a, "Back does not wrap");
      await keys("2ti");
      Assert.equal(
        gBrowser.selectedTab,
        a,
        "A count can return to the same tab"
      );
      await keys("to");
      Assert.equal(
        gBrowser.selectedTab,
        b,
        "Same-tab destinations still move the cursor"
      );
      await keys("to");
      Assert.equal(gBrowser.selectedTab, a);

      let switches = 0;
      const onSelect = () => switches++;
      gBrowser.tabContainer.addEventListener("TabSelect", onSelect);
      try {
        await keys("3ti");
        Assert.equal(gBrowser.selectedTab, c);
        Assert.equal(switches, 1, "Counts activate only the final destination");
      } finally {
        gBrowser.tabContainer.removeEventListener("TabSelect", onSelect);
      }
      await keys("999ti");
      Assert.equal(gBrowser.selectedTab, c, "Forward does not wrap");
      await keys("to");
      await selectTab(d);
      await keys("ti");
      Assert.equal(gBrowser.selectedTab, d, "A new visit discards the branch");
      await keys("to");
      Assert.equal(gBrowser.selectedTab, a);
      await keys("to");
      Assert.equal(gBrowser.selectedTab, b);
      await keys("999to");
      Assert.equal(gBrowser.selectedTab, a, "Large counts stop at the start");
    } finally {
      await BrowserTestUtils.removeTab(background);
    }
  });
});

add_task(async function closed_and_hidden_entries() {
  await withTabs(4, async ([a, b, c, d]) => {
    await selectTab(b);
    await selectTab(a);
    await selectTab(c);
    await selectTab(b);
    await selectTab(d);
    await BrowserTestUtils.removeTab(b);
    Assert.ok(
      !gModalNavigation.tabs.history.includes(b),
      "Closing a tab releases every historical reference"
    );
    await keys("to");
    Assert.equal(
      gBrowser.selectedTab,
      c,
      "Closed entries do not consume steps"
    );
    await keys("to");
    Assert.equal(gBrowser.selectedTab, a);
    await keys("to");
    Assert.equal(
      gBrowser.selectedTab,
      a,
      "Adjacent duplicate visits are skipped"
    );
    await keys("ti");
    Assert.equal(
      gBrowser.selectedTab,
      c,
      "The cursor survives removed entries"
    );
    await keys("ti");
    Assert.equal(gBrowser.selectedTab, d);

    gBrowser.hideTab(c);
    await keys("to");
    Assert.equal(gBrowser.selectedTab, a, "Hidden visits do not consume steps");
    await keys("ti");
    Assert.equal(gBrowser.selectedTab, d);
    gBrowser.showTab(c);
    await keys("to");
    Assert.equal(gBrowser.selectedTab, c, "A shown tab is eligible again");
    await BrowserTestUtils.removeTab(d);
    await keys("ti");
    Assert.equal(
      gBrowser.selectedTab,
      c,
      "Closing a forward entry repairs history"
    );
    await BrowserTestUtils.removeTab(c);
    Assert.equal(gBrowser.selectedTab, a);
    await keys("toti");
    Assert.equal(
      gBrowser.selectedTab,
      a,
      "Closing the current tab leaves a usable cursor"
    );
  });
});

add_task(async function exact_tabs_survive_groups_splits_and_movement() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.tabs.splitView.enabled", true]],
  });
  try {
    await withTabs(4, async ([a, b, c, d]) => {
      const group = gBrowser.addTabGroup([b, c], { insertBefore: b });
      await selectTab(b);
      await selectTab(c);
      group.collapsed = true;
      await selectTab(d);
      await keys("to");
      Assert.equal(gBrowser.selectedTab, c);
      await keys("to");
      Assert.equal(
        gBrowser.selectedTab,
        b,
        "History selects the exact folded member"
      );
      Assert.ok(group.collapsed, "History preserves folding");
      await keys("ti");
      Assert.equal(gBrowser.selectedTab, c);
      await keys("tH");
      await keys("to");
      Assert.equal(
        gBrowser.selectedTab,
        b,
        "Reordering does not change tab identity"
      );
      await keys("ti");
      Assert.equal(
        gBrowser.selectedTab,
        c,
        "Movement does not discard forward visits"
      );

      group.collapsed = false;
      const split = gBrowser.addTabSplitView([a, d], { insertBefore: a });
      await selectTab(a);
      await selectTab(d);
      await keys("to");
      Assert.equal(gBrowser.selectedTab, a, "Split panes are distinct visits");
      await keys("ti");
      Assert.equal(gBrowser.selectedTab, d);
      Assert.equal(a.splitview, split);
      Assert.equal(d.splitview, split, "History keeps the split intact");
    });
  } finally {
    await SpecialPowers.popPrefEnv();
  }
});

add_task(async function history_returns_to_command_without_leaking_keys() {
  await withTabs(
    2,
    async ([a, b]) => {
      await BrowserTestUtils.synthesizeMouseAtCenter(
        "#editor",
        {},
        a.linkedBrowser
      );
      await TestUtils.waitForCondition(
        () => gModalNavigation.mode === "insert"
      );
      await selectTab(b);
      await keys("to");
      Assert.equal(gBrowser.selectedTab, a);
      Assert.equal(gModalNavigation.mode, "command");
      Assert.equal(document.activeElement, a.linkedBrowser);
      Assert.equal(gModalNavigation.keymap.prefix, "");
      await keys("ti");
      for (const tab of [a, b]) {
        await SpecialPowers.spawn(tab.linkedBrowser, [], () => {
          Assert.deepEqual(
            Array.from(content.wrappedJSObject.keyEvents),
            [],
            "History shortcut presses and releases stay out of page content"
          );
        });
      }

      await keys("to");
      await keys(" e");
      Assert.ok(gURLBar.focused);
      await selectTab(b);
      await keys("to");
      Assert.equal(gBrowser.selectedTab, a);
      Assert.equal(gModalNavigation.mode, "command");
      Assert.equal(document.activeElement, a.linkedBrowser);
      Assert.ok(!gURLBar.focused, "History does not restore address editing");
      await keys("/");
      await TestUtils.waitForCondition(
        () => gModalNavigation.mode === "search"
      );
      await selectTab(b);
      await keys("to");
      Assert.equal(gBrowser.selectedTab, a);
      Assert.equal(gModalNavigation.mode, "command");
      Assert.equal(
        document.activeElement,
        a.linkedBrowser,
        "History does not restore find-field focus"
      );
    },
    HISTORY_PAGE
  );
});

add_task(async function preferences_reset_only_when_disabled() {
  await withTabs(3, async ([a, b, c]) => {
    await selectTab(b);
    await SpecialPowers.pushPrefEnv({
      set: [["browser.modal.keybindings", '{"g o":"tab.history-back"}']],
    });
    try {
      await keys("go");
      Assert.equal(gBrowser.selectedTab, a, "Rebinding preserves history");
      gBrowser.selectedTab = a;
      await keys("ti");
      Assert.equal(
        gBrowser.selectedTab,
        b,
        "Same-tab selection preserves forward visits"
      );
    } finally {
      await SpecialPowers.popPrefEnv();
    }
    await SpecialPowers.pushPrefEnv({
      set: [["browser.modal.enabled", false]],
    });
    try {
      Assert.deepEqual(
        gModalNavigation.tabs.history,
        [],
        "Disabling clears references"
      );
      await BrowserTestUtils.switchTab(gBrowser, c);
    } finally {
      await SpecialPowers.popPrefEnv();
    }
    gModalNavigation.enterCommand();
    await keys("to");
    Assert.equal(gBrowser.selectedTab, c, "Re-enabling seeds the current tab");
    await selectTab(a);
    await keys("to");
    Assert.equal(gBrowser.selectedTab, c, "New visits work after re-enabling");
  });
});

add_task(async function window_histories_are_independent() {
  await withTabs(2, async ([a, b]) => {
    await selectTab(b);
    for (const isPrivate of [false, true]) {
      const win = await BrowserTestUtils.openNewBrowserWindow({
        private: isPrivate,
      });
      try {
        const initial = win.gBrowser.selectedTab;
        await BrowserTestUtils.openNewForegroundTab(
          win.gBrowser,
          "about:blank"
        );
        win.gModalNavigation.enterCommand();
        await keys("to", win);
        Assert.equal(
          win.gBrowser.selectedTab,
          initial,
          "Each window seeds its own history"
        );
        await keys("to", win);
        Assert.equal(
          win.gBrowser.selectedTab,
          initial,
          "History stays in its window"
        );
        Assert.equal(gBrowser.selectedTab, b);
      } finally {
        await BrowserTestUtils.closeWindow(win);
        await SimpleTest.promiseFocus(window);
      }
    }
    gModalNavigation.enterCommand();
    await keys("to");
    Assert.equal(
      gBrowser.selectedTab,
      a,
      "Other windows do not affect this history"
    );
  });
});

add_task(async function moving_tabs_between_windows_releases_source_entries() {
  await withTabs(3, async ([a, b, c]) => {
    await selectTab(b);
    await selectTab(c);
    const win = await BrowserTestUtils.openNewBrowserWindow();
    try {
      const initial = win.gBrowser.selectedTab;
      const adopted = win.gBrowser.adoptTab(b, { tabIndex: 1 });
      Assert.ok(adopted, "The tab moved to the second window");
      Assert.ok(!gModalNavigation.tabs.history.includes(b));
      await SimpleTest.promiseFocus(window);
      gModalNavigation.enterCommand();
      await keys("to");
      Assert.equal(
        gBrowser.selectedTab,
        a,
        "History skips the transferred tab"
      );
      await keys("ti");
      Assert.equal(gBrowser.selectedTab, c);

      await SimpleTest.promiseFocus(win);
      await BrowserTestUtils.switchTab(win.gBrowser, adopted);
      win.gModalNavigation.enterCommand();
      await keys("to", win);
      Assert.equal(
        win.gBrowser.selectedTab,
        initial,
        "The receiving window records its own visit"
      );
    } finally {
      await BrowserTestUtils.closeWindow(win);
      await SimpleTest.promiseFocus(window);
    }
  });
});
