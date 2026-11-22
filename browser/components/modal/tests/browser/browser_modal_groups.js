/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global gModalNavigation */

const { UrlbarTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/UrlbarTestUtils.sys.mjs"
);
UrlbarTestUtils.init(this);

async function keys(sequence) {
  for (const key of sequence) {
    EventUtils.synthesizeKey(key, { shiftKey: /^[A-Z]$/.test(key) });
  }
  await TestUtils.waitForTick();
}

async function selectTab(tab) {
  if (gBrowser.selectedTab !== tab) {
    await BrowserTestUtils.switchTab(gBrowser, tab);
  }
  gModalNavigation.enterCommand();
  await TestUtils.waitForCondition(
    () => document.activeElement === tab.linkedBrowser
  );
}

async function groupQuery(key, value, mode) {
  await keys(`tg${key}`);
  await TestUtils.waitForCondition(() => gModalNavigation.urlbar.mode === mode);
  await UrlbarTestUtils.promiseAutocompleteResultPopup({ window, value });
}

async function openGroupCreation() {
  const menu = gBrowser.tabGroupMenu;
  const shown = BrowserTestUtils.waitForEvent(menu.panel, "popupshown");
  await keys("tgn");
  await shown;
  const name = document.getElementById("tab-group-name");
  await TestUtils.waitForCondition(() => document.activeElement === name);
  Assert.ok(menu.createMode, "tgn opens the native creation dialog");
  Assert.ok(!gURLBar.focused, "Group creation does not use the address bar");
  return menu;
}

add_task(async function two_levels_of_navigation() {
  const tabs = [];
  try {
    for (let i = 0; i < 6; i++) {
      tabs.push(
        await BrowserTestUtils.openNewForegroundTab(gBrowser, "about:blank")
      );
    }
    const [a, b1, b2, b3, c, d] = tabs;
    const group = gBrowser.addTabGroup([b1, b2, b3], {
      insertBefore: b1,
      label: "Research",
    });
    await selectTab(b2);
    await keys("tgf");
    Assert.ok(group.collapsed, "Fold keeps the active member selected");
    Assert.equal(gBrowser.selectedTab, b2);
    await TestUtils.waitForCondition(() =>
      group.overflowCountLabel.textContent.includes("2/3")
    );
    await selectTab(a);
    await keys("3tj");
    Assert.equal(
      gBrowser.selectedTab,
      d,
      "Count treats the folded group as one stop"
    );
    Assert.ok(group.collapsed);
    await keys("tk");
    Assert.equal(gBrowser.selectedTab, c);
    await keys("tk");
    Assert.equal(gBrowser.selectedTab, b2, "Returns to last-active member");
    await keys("tgj");
    Assert.equal(gBrowser.selectedTab, b3);
    await keys("tgj");
    Assert.equal(gBrowser.selectedTab, b1, "Within-group cycling wraps");
    await keys("2tgk");
    Assert.equal(gBrowser.selectedTab, b2);
    Assert.ok(group.collapsed, "Within-group movement preserves folding");
    await keys("tj");
    Assert.equal(gBrowser.selectedTab, c);
    await keys("tgj");
    Assert.equal(
      gBrowser.selectedTab,
      c,
      "Ungrouped tabs have no inner navigation"
    );
    await keys("tk");
    await keys("tgo");
    Assert.ok(!group.collapsed);
    await selectTab(a);
    await keys("3tj");
    Assert.equal(
      gBrowser.selectedTab,
      b3,
      "Unfolded members each count as a stop"
    );
    await keys("tgj");
    Assert.equal(
      gBrowser.selectedTab,
      b1,
      "Inner navigation also works unfolded"
    );
    Assert.equal(gModalNavigation.mode, "command");
    const background = BrowserTestUtils.addTab(gBrowser, "about:blank");
    tabs.push(background);
    group.addTabs([background]);
    group.collapsed = true;
    await selectTab(a);
    await keys("tj");
    Assert.equal(
      gBrowser.selectedTab,
      b1,
      "A newly opened background member does not replace the last-active tab"
    );
  } finally {
    for (const tab of tabs) {
      await BrowserTestUtils.removeTab(tab);
    }
  }
});

add_task(async function keyboard_group_management() {
  const a = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:blank"
  );
  const b = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:blank"
  );
  try {
    await selectTab(a);
    const menu = await openGroupCreation();
    EventUtils.sendString("Cancelled group");
    let hidden = BrowserTestUtils.waitForEvent(menu.panel, "popuphidden");
    EventUtils.synthesizeKey("KEY_Escape");
    await hidden;
    await TestUtils.waitForCondition(() => gModalNavigation.mode === "command");
    Assert.ok(
      !a.group && a.isOpen,
      "Native cancellation ungroups the tab without closing it"
    );
    await openGroupCreation();
    EventUtils.sendString("Keyboard Research");
    const group = a.group;
    const initialColor = group.color;
    const color = initialColor === "green" ? "blue" : "green";
    EventUtils.synthesizeMouseAtCenter(
      menu.querySelector(`label[for="tab-group-editor-swatch-${color}"]`),
      {}
    );
    await TestUtils.waitForCondition(() => group.color === color);
    hidden = BrowserTestUtils.waitForEvent(menu.panel, "popuphidden");
    EventUtils.synthesizeKey("KEY_Enter");
    await hidden;
    await TestUtils.waitForCondition(
      () => a.group?.label === "Keyboard Research"
    );
    Assert.notEqual(
      group.color,
      initialColor,
      "The native colour choice is retained"
    );
    await selectTab(b);
    await groupQuery("m", "Keyboard Research", "group-move");
    EventUtils.synthesizeKey("KEY_Enter");
    await TestUtils.waitForCondition(() => b.group === group);
    Assert.equal(gBrowser.selectedTab, b);
    await keys("tgf");
    await keys("tgu");
    Assert.ok(!b.group && b.isOpen, "Ungroup keeps the tab open");
  } finally {
    await BrowserTestUtils.removeTab(a);
    await BrowserTestUtils.removeTab(b);
  }
});

add_task(async function counted_tab_movement() {
  const tabs = [];
  try {
    for (let i = 0; i < 6; i++) {
      tabs.push(
        await BrowserTestUtils.openNewForegroundTab(gBrowser, "about:blank")
      );
    }
    const [a, b1, b2, b3, c, d] = tabs;
    const group = gBrowser.addTabGroup([b1, b2, b3], { insertBefore: b1 });
    group.collapsed = true;
    const order = () => gBrowser.tabs.filter(tab => tabs.includes(tab));
    await selectTab(a);
    await keys("tJ");
    Assert.deepEqual(
      order(),
      [b1, b2, b3, a, c, d],
      "One move passes one folded-group stop"
    );
    Assert.equal(gBrowser.selectedTab, a, "Movement keeps the tab selected");
    Assert.ok(
      !a.group && group.collapsed,
      "Movement preserves membership and folding"
    );
    await keys("2tJ");
    Assert.deepEqual(order(), [b1, b2, b3, c, d, a]);
    await keys("3tK");
    Assert.deepEqual(
      order(),
      [a, b1, b2, b3, c, d],
      "Backward counts use the same folded stops"
    );

    group.collapsed = false;
    await keys("tJ");
    Assert.deepEqual(
      order(),
      [b1, a, b2, b3, c, d],
      "Moving to a member of an unfolded group enters that group"
    );
    Assert.equal(a.group, group);
    await keys("3tJ");
    Assert.deepEqual(
      order(),
      [b1, b2, b3, c, a, d],
      "Forward counts traverse unfolded members and leave the group"
    );
    Assert.ok(!a.group, "tJ can move a tab out of its group");
    await keys("tK");
    await keys("2tK");
    Assert.deepEqual(
      group.tabs,
      [b1, a, b2, b3],
      "Backward movement enters an unfolded group"
    );
    await keys("2tK");
    Assert.ok(!a.group, "tK can move a tab out of its group");
    gBrowser.moveTabBefore(a, group);
    group.collapsed = true;

    await selectTab(a);
    gBrowser.hideTab(c);
    await keys("2tJ");
    Assert.deepEqual(
      order(),
      [b1, b2, b3, c, d, a],
      "Hidden tabs do not consume movement counts"
    );
    await keys("999tJ");
    Assert.equal(order().at(-1), a, "Moving past the end does not wrap");
    gBrowser.showTab(c);
    gBrowser.pinTab(c);
    gBrowser.pinTab(a);
    await keys("tK");
    Assert.deepEqual(
      order().slice(0, 2),
      [a, c],
      "Pinned tabs can be reordered"
    );
    await keys("999tJ");
    Assert.deepEqual(
      order().slice(0, 2),
      [c, a],
      "Pinned movement stops before unpinned tabs"
    );
    Assert.ok(a.pinned && !a.group);
    Assert.equal(gBrowser.selectedTab, a);
  } finally {
    for (const tab of tabs) {
      await BrowserTestUtils.removeTab(tab);
    }
  }
});

add_task(async function wrapping_movement_within_group() {
  const tabs = [];
  try {
    for (let i = 0; i < 3; i++) {
      tabs.push(
        await BrowserTestUtils.openNewForegroundTab(gBrowser, "about:blank")
      );
    }
    const [a, b, c] = tabs;
    const group = gBrowser.addTabGroup(tabs, { insertBefore: a });
    await selectTab(a);
    await keys("tgK");
    Assert.deepEqual(
      group.tabs,
      [b, c, a],
      "Backward movement wraps to the group end"
    );
    await keys("tgJ");
    Assert.deepEqual(
      group.tabs,
      [a, b, c],
      "Forward movement wraps to the group start"
    );
    await keys("2tgJ");
    Assert.deepEqual(
      group.tabs,
      [b, c, a],
      "Counts reorder only within the group"
    );
    await keys("2tgK");
    Assert.deepEqual(group.tabs, [a, b, c]);
    await keys("tgf");
    await keys("4tgK");
    Assert.deepEqual(
      group.tabs,
      [b, c, a],
      "Counts wrap in a folded group too"
    );
    Assert.ok(group.collapsed, "Reordering preserves folding");
    Assert.equal(gBrowser.selectedTab, a, "The moved tab stays selected");
    await keys("3tgJ");
    Assert.deepEqual(
      group.tabs,
      [b, c, a],
      "A whole cycle does not reorder tabs"
    );

    await keys("tJ");
    Assert.ok(!a.group, "tJ leaves even a folded group at the strip end");
    Assert.ok(group.collapsed);
    Assert.greater(a.index, c.index);
    const order = [...gBrowser.tabs];
    await keys("tgK");
    Assert.deepEqual(
      gBrowser.tabs,
      order,
      "Within-group movement does nothing on ungrouped tabs"
    );

    group.collapsed = false;
    await selectTab(b);
    await keys("999tK");
    Assert.ok(!b.group, "Backward movement can leave the group");
    await selectTab(c);
    await keys("tgJ");
    Assert.equal(c.group, group, "A single-member group keeps its member");
  } finally {
    for (const tab of tabs) {
      await BrowserTestUtils.removeTab(tab);
    }
  }
});

add_task(async function exact_folded_tab_picker() {
  const tabs = [];
  try {
    for (let i = 0; i < 3; i++) {
      tabs.push(
        await BrowserTestUtils.openNewForegroundTab(gBrowser, "about:blank")
      );
    }
    const [first, target, other] = tabs;
    gBrowser.addTabGroup([first], { label: "First duplicate" });
    const group = gBrowser.addTabGroup([target], { label: "Exact duplicate" });
    group.collapsed = true;
    await selectTab(other);
    await keys(" b");
    await TestUtils.waitForCondition(
      () => gModalNavigation.urlbar.mode === "tabs"
    );
    await UrlbarTestUtils.promiseAutocompleteResultPopup({
      window,
      value: "duplicate",
    });
    Assert.equal(
      UrlbarTestUtils.getResultCount(window),
      2,
      "Both copies of the same URL remain selectable"
    );
    const index = [0, 1].find(i =>
      gURLBar.view.getResultAtIndex(i).payload.title.includes("Exact duplicate")
    );
    gURLBar.view.selectedRowIndex = index;
    EventUtils.synthesizeKey("KEY_Enter");
    await TestUtils.waitForCondition(() => gBrowser.selectedTab === target);
    Assert.ok(
      group.collapsed,
      "Exact tab activation does not unfold its group"
    );
    Assert.equal(gModalNavigation.mode, "command");

    await selectTab(other);
    await keys(" b");
    await TestUtils.waitForCondition(
      () => gModalNavigation.urlbar.mode === "tabs"
    );
    await UrlbarTestUtils.promiseAutocompleteResultPopup({
      window,
      value: "Exact duplicate",
    });
    const stale = gURLBar.view.getResultAtIndex(0);
    await BrowserTestUtils.removeTab(target);
    gModalNavigation.urlbar.acceptTarget(stale);
    Assert.equal(
      gBrowser.selectedTab,
      other,
      "A stale result cannot activate another URL duplicate"
    );
    EventUtils.synthesizeKey("KEY_Escape");
    await TestUtils.waitForCondition(() => gModalNavigation.mode === "command");
  } finally {
    for (const tab of tabs) {
      if (tab.isOpen) {
        await BrowserTestUtils.removeTab(tab);
      }
    }
  }
});

add_task(async function grouping_boundaries_and_hidden_tabs() {
  const source = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:blank"
  );
  const member = BrowserTestUtils.addTab(gBrowser, "about:blank");
  const hidden = BrowserTestUtils.addTab(gBrowser, "about:blank");
  const container = BrowserTestUtils.addTab(gBrowser, "about:blank", {
    userContextId: 1,
  });
  try {
    const group = gBrowser.addTabGroup([member], { label: "Destination" });
    group.collapsed = true;
    await selectTab(source);
    gBrowser.pinTab(source);
    await keys("tgn");
    Assert.ok(
      !source.group && source.pinned,
      "Grouping does not silently unpin a tab"
    );
    Assert.equal(gModalNavigation.mode, "command");
    gBrowser.unpinTab(source);
    await groupQuery("m", "Destination", "group-move");
    EventUtils.synthesizeKey("KEY_Enter");
    await TestUtils.waitForCondition(() => source.group === group);
    Assert.ok(
      group.collapsed,
      "Moving into a folded group preserves its folded state"
    );
    Assert.equal(gBrowser.selectedTab, source);

    gBrowser.hideTab(hidden);
    await keys(" b");
    await TestUtils.waitForCondition(
      () => gModalNavigation.urlbar.mode === "tabs"
    );
    await UrlbarTestUtils.promiseAutocompleteResultPopup({ window, value: "" });
    const targets = Array.from(
      { length: UrlbarTestUtils.getResultCount(window) },
      (_, i) =>
        gModalNavigation.urlbar.targets.get(gURLBar.view.getResultAtIndex(i))
          ?.tab
    );
    Assert.ok(targets.includes(member), "Folded members are offered");
    Assert.ok(!targets.includes(hidden), "Hidden tabs are excluded");
    Assert.ok(!targets.includes(container), "Other containers are excluded");
    EventUtils.synthesizeKey("KEY_Escape");
    await TestUtils.waitForCondition(() => gModalNavigation.mode === "command");
  } finally {
    for (const tab of [source, member, hidden, container]) {
      await BrowserTestUtils.removeTab(tab);
    }
  }
});

add_task(async function native_group_editor_shortcut() {
  const tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:blank"
  );
  try {
    const group = gBrowser.addTabGroup([tab], { label: "Edit group" });
    await selectTab(tab);
    const shown = BrowserTestUtils.waitForEvent(
      gBrowser.tabGroupMenu.panel,
      "popupshown"
    );
    await keys("tge");
    await shown;
    Assert.equal(gBrowser.tabGroupMenu.activeGroup, group);
    const hidden = BrowserTestUtils.waitForEvent(
      gBrowser.tabGroupMenu.panel,
      "popuphidden"
    );
    EventUtils.synthesizeKey("KEY_Escape");
    await hidden;
  } finally {
    await BrowserTestUtils.removeTab(tab);
  }
});

add_task(async function tab_and_group_endpoints() {
  const first = gBrowser.nonHiddenTabs[0];
  const tabs = [];
  try {
    for (let i = 0; i < 4; i++) {
      tabs.push(
        await BrowserTestUtils.openNewForegroundTab(gBrowser, "about:blank")
      );
    }
    const [a, b, c, d] = tabs;
    const group = gBrowser.addTabGroup([a, b, c], { insertBefore: a });
    group.collapsed = true;
    await selectTab(b);
    await keys("tgh");
    Assert.equal(
      gBrowser.selectedTab,
      a,
      "Navigate to the first member of a folded group"
    );
    await keys("tgl");
    Assert.equal(
      gBrowser.selectedTab,
      c,
      "Navigate to the last member of a folded group"
    );
    await keys("tgH");
    Assert.deepEqual(
      group.tabs,
      [c, a, b],
      "Move to the beginning of the group"
    );
    await keys("tgL");
    Assert.deepEqual(group.tabs, [a, b, c], "Move to the end of the group");
    Assert.equal(gBrowser.selectedTab, c);
    Assert.ok(group.collapsed, "Endpoint operations preserve folding");

    await selectTab(d);
    const order = [...gBrowser.tabs];
    for (const sequence of ["tgh", "tgl", "tgH", "tgL", "tt"]) {
      await keys(sequence);
      Assert.equal(
        gBrowser.selectedTab,
        d,
        `${sequence} does not change the ungrouped tab`
      );
      Assert.deepEqual(gBrowser.tabs, order);
      Assert.equal(gModalNavigation.mode, "command");
    }
    await keys("th");
    Assert.equal(
      gBrowser.selectedTab,
      first,
      "Navigate to the first window stop"
    );
    await keys("tl");
    Assert.equal(gBrowser.selectedTab, d, "Navigate to the last window stop");

    gBrowser.moveTabAfter(group, d);
    await selectTab(b);
    await selectTab(d);
    await keys("tl");
    Assert.equal(
      gBrowser.selectedTab,
      b,
      "A folded last group uses its last-active member"
    );
    gBrowser.moveTabBefore(group, first);
    await selectTab(d);
    await keys("th");
    Assert.equal(
      gBrowser.selectedTab,
      b,
      "A folded first group uses its last-active member"
    );
    await keys("tH");
    Assert.equal(gBrowser.nonHiddenTabs[0], b);
    Assert.ok(!b.group, "Moving to the window beginning leaves the group");
    await keys("tL");
    Assert.equal(gBrowser.nonHiddenTabs.at(-1), b);
    Assert.equal(gBrowser.selectedTab, b);
    Assert.ok(group.collapsed);

    gBrowser.pinTab(d);
    gBrowser.pinTab(b);
    await keys("tH");
    Assert.equal(gBrowser.nonHiddenTabs[0], b);
    await keys("tL");
    Assert.equal(gBrowser.nonHiddenTabs.filter(tab => tab.pinned).at(-1), b);
    Assert.ok(b.pinned, "Endpoint movement respects pinned tabs");
    await selectTab(a);
    await keys("tH");
    Assert.equal(
      gBrowser.nonHiddenTabs.find(tab => !tab.pinned),
      a
    );
    Assert.ok(
      !a.pinned && !a.group,
      "Unpinned movement stops after pinned tabs and exits groups"
    );
  } finally {
    for (const tab of tabs) {
      await BrowserTestUtils.removeTab(tab);
    }
  }
});
