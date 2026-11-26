/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global gModalNavigation */

async function keys(sequence) {
  for (const key of sequence) {
    EventUtils.synthesizeKey(key, { shiftKey: /^[A-Z]$/.test(key) });
  }
  await TestUtils.waitForTick();
}

async function withTabs(count, task) {
  const tabs = [];
  try {
    for (let i = 0; i < count; i++) {
      tabs.push(
        await BrowserTestUtils.openNewForegroundTab(gBrowser, "about:blank")
      );
    }
    gModalNavigation.enterCommand();
    await task(tabs);
  } finally {
    gBrowser.clearMultiSelectedTabs();
    gModalNavigation.enterCommand();
    for (const tab of tabs) {
      if (tab.isOpen) {
        await BrowserTestUtils.removeTab(tab);
      }
    }
  }
}

function assertSelection(tabs, active) {
  Assert.deepEqual(gBrowser.selectedTabs, tabs, "Selection is retained");
  Assert.equal(gBrowser.selectedTab, active, "The active tab is retained");
  Assert.equal(gModalNavigation.mode, "command");
  Assert.equal(
    document.activeElement,
    active.linkedBrowser,
    "Page focus is retained"
  );
}

add_task(async function current_tab_pinning_is_idempotent_and_ignores_counts() {
  await withTabs(2, async ([other, tab]) => {
    await keys("3tp");
    Assert.ok(tab.pinned);
    Assert.ok(!other.pinned, "Counts do not pin neighboring tabs");
    assertSelection([tab], tab);
    const pinnedOrder = [...gBrowser.tabs];
    await keys("tp");
    Assert.deepEqual(gBrowser.tabs, pinnedOrder, "Pinning again is a no-op");
    await keys("3tP");
    Assert.ok(!tab.pinned);
    assertSelection([tab], tab);
    const unpinnedOrder = [...gBrowser.tabs];
    await keys("tP");
    Assert.deepEqual(
      gBrowser.tabs,
      unpinnedOrder,
      "Unpinning again is a no-op"
    );

    await keys("i");
    await keys("tp");
    Assert.ok(!tab.pinned, "Insert mode does not dispatch pinning");
    EventUtils.synthesizeKey("KEY_Escape");
    await keys("t");
    EventUtils.synthesizeKey("KEY_Escape");
    await keys("p");
    Assert.ok(!tab.pinned, "Escape cancels the pending pin command");
  });
});

add_task(async function pinning_a_retained_range_preserves_order() {
  await withTabs(3, async ([a, b, c]) => {
    await keys("tv2k");
    EventUtils.synthesizeKey("KEY_Escape");
    await keys("tp");
    Assert.ok([a, b, c].every(tab => tab.pinned));
    assertSelection([a, b, c], c);
    await keys("tP");
    Assert.ok([a, b, c].every(tab => !tab.pinned));
    Assert.deepEqual(
      gBrowser.tabs.slice(0, 3),
      [a, b, c],
      "Unpinning keeps visual order at the start of the unpinned section"
    );
    assertSelection([a, b, c], c);
  });
});

add_task(
  async function mixed_discontiguous_selection_only_changes_selected_tabs() {
    await withTabs(5, async ([a, b, c, d, e]) => {
      gBrowser.pinTab(a);
      gBrowser.pinTab(b);
      gModalNavigation.tabs.replaceSelection([b, c, e]);
      await keys("tp");
      Assert.deepEqual(gBrowser.tabs.slice(0, 4), [a, b, c, e]);
      Assert.ok(!d.pinned, "The unselected gap stays unpinned");
      assertSelection([b, c, e], e);

      gModalNavigation.tabs.replaceSelection([b, d, e]);
      await keys("tP");
      Assert.deepEqual(
        gBrowser.tabs.slice(0, 4),
        [a, c, b, e],
        "Unselected pinned tabs stay pinned and unpinned tabs keep their order"
      );
      Assert.ok(a.pinned && c.pinned);
      Assert.ok(!b.pinned && !d.pinned && !e.pinned);
      assertSelection([b, e, d], e);
    });
  }
);

add_task(async function pinning_group_members_preserves_the_remaining_group() {
  await withTabs(3, async ([a, b, c]) => {
    const group = gBrowser.addTabGroup([a, b, c], { insertBefore: a });
    group.collapsed = true;
    gModalNavigation.tabs.replaceSelection([a, c]);
    await keys("tp");
    Assert.ok(a.pinned && c.pinned);
    Assert.ok(!a.group && !c.group);
    Assert.deepEqual(group.tabs, [b]);
    Assert.ok(group.collapsed, "The remaining group stays folded");
    assertSelection([a, c], c);
    await keys("tP");
    Assert.ok(!a.group && !c.group, "Unpinning does not restore groups");
    assertSelection([a, c], c);
  });
});

add_task(
  async function pinning_separates_partial_and_complete_split_selections() {
    for (const grouped of [false, true]) {
      for (const complete of [false, true]) {
        await withTabs(3, async ([a, b, c]) => {
          const split = gBrowser.addTabSplitView([b, c], { insertBefore: b });
          const group = grouped
            ? gBrowser.addTabGroup([a, split], { insertBefore: a })
            : null;
          if (group) {
            group.collapsed = true;
          }
          const selected = complete ? [b, c] : [c];
          gModalNavigation.tabs.replaceSelection(selected);
          await keys("tp");
          Assert.ok(!b.splitview && !c.splitview, "The split is separated");
          Assert.ok(b.isOpen && c.isOpen, "Both normal tabs remain open");
          Assert.equal(
            b.pinned,
            complete,
            "Only selected split members are pinned"
          );
          Assert.ok(c.pinned);
          Assert.ok(!a.pinned);
          if (group) {
            Assert.deepEqual(group.tabs, complete ? [a] : [a, b]);
            Assert.ok(group.collapsed, "Unselected group members stay folded");
          }
          assertSelection(selected, c);
          await keys("tP");
          Assert.ok(!b.pinned && !c.pinned);
          Assert.ok(!b.splitview && !c.splitview);
          assertSelection(selected, c);
        });
      }
    }
  }
);
