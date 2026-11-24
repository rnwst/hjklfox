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

async function activate(tab) {
  if (gBrowser.selectedTab !== tab) {
    await BrowserTestUtils.switchTab(gBrowser, tab);
  }
  gModalNavigation.enterCommand();
}

add_task(async function selection_keeps_displayed_tab_and_unfolds_groups() {
  const tabs = [];
  try {
    for (let i = 0; i < 5; i++) {
      tabs.push(
        await BrowserTestUtils.openNewForegroundTab(gBrowser, "about:blank")
      );
    }
    const [a, b, c, d, e] = tabs;
    const group = gBrowser.addTabGroup([b, c, d], { insertBefore: b });
    group.collapsed = true;
    await activate(a);
    await keys("tv");
    Assert.equal(gModalNavigation.mode, "select");
    await keys("j");
    Assert.ok(
      !group.collapsed,
      "Entering a folded group permanently unfolds it"
    );
    Assert.deepEqual(
      gBrowser.selectedTabs,
      [a, b],
      "Forward entry selects the leftmost member"
    );
    Assert.equal(gModalNavigation.tabs.selectionCursor, b);
    Assert.equal(
      gBrowser.selectedTab,
      a,
      "Selection never switches the displayed tab"
    );
    await keys("k");
    Assert.deepEqual(
      gBrowser.selectedTabs,
      [a],
      "Reversing a step deselects the added tab"
    );
    Assert.ok(!b.multiselected);
    Assert.ok(
      !group.collapsed,
      "Shrinking selection does not refold the group"
    );
    await keys("3j");
    Assert.deepEqual(
      gBrowser.selectedTabs,
      [a, b, c, d],
      "Counts select every traversed member"
    );
    await keys("k");
    Assert.equal(gModalNavigation.tabs.selectionCursor, c);
    Assert.deepEqual(
      gBrowser.selectedTabs,
      [a, b, c],
      "Moving backward shrinks the range"
    );
    await keys("l");
    Assert.deepEqual(gBrowser.selectedTabs, tabs, "Extend to the last tab");
    await keys("h");
    const beginningRange = gBrowser.nonHiddenTabs.slice(
      0,
      gBrowser.nonHiddenTabs.indexOf(a) + 1
    );
    Assert.deepEqual(
      gBrowser.selectedTabs,
      beginningRange,
      "Extend to the first tab"
    );
    Assert.equal(gBrowser.selectedTab, a);
    EventUtils.synthesizeKey("KEY_Escape");
    Assert.equal(gModalNavigation.mode, "command");
    Assert.deepEqual(
      gBrowser.selectedTabs,
      beginningRange,
      "Escape retains the selection"
    );
    Assert.ok(!document.querySelector("[modal-selection-cursor]"));

    await activate(e);
    group.collapsed = true;
    await keys("tvk");
    Assert.deepEqual(
      gBrowser.selectedTabs,
      [d, e],
      "Backward entry starts at the rightmost member"
    );
    Assert.ok(!group.collapsed);
    Assert.equal(gBrowser.selectedTab, e);
    await keys("5k");
    Assert.deepEqual(
      gBrowser.selectedTabs,
      gBrowser.nonHiddenTabs,
      "Large counts stop at the edge"
    );
    EventUtils.synthesizeKey("KEY_Escape");
    await activate(c);
    await keys("tv2j");
    Assert.deepEqual(gBrowser.selectedTabs, [c, d, e]);
    await keys("3k");
    Assert.deepEqual(
      gBrowser.selectedTabs,
      [b, c],
      "Crossing the anchor extends the range in the other direction"
    );
    Assert.equal(gBrowser.selectedTab, c);
    await keys("h");
    Assert.deepEqual(
      gBrowser.selectedTabs,
      gBrowser.nonHiddenTabs.slice(0, gBrowser.nonHiddenTabs.indexOf(c) + 1)
    );
    await keys("l");
    Assert.deepEqual(
      gBrowser.selectedTabs,
      [c, d, e],
      "Range endpoints stay anchored to the original tab"
    );
    EventUtils.synthesizeKey("KEY_Escape");
  } finally {
    gBrowser.clearMultiSelectedTabs();
    gModalNavigation.enterCommand();
    for (const tab of tabs) {
      await BrowserTestUtils.removeTab(tab);
    }
  }
});

add_task(async function selection_mode_survives_a_pending_navigation() {
  const base =
    "https://example.com/browser/browser/components/modal/tests/browser/";
  await BrowserTestUtils.withNewTab(`${base}page.html`, async browser => {
    const anchor = gBrowser.selectedTab;
    const other = BrowserTestUtils.addTab(gBrowser, "about:blank");
    const loaded = BrowserTestUtils.browserLoaded(
      browser,
      false,
      `${base}loading.sjs?document`
    );
    let finished = false;
    const finish = async () => {
      await fetch(`${base}loading.sjs?finish-document`);
      await loaded;
      await TestUtils.waitForTick();
      finished = true;
    };
    try {
      BrowserTestUtils.startLoadingURIString(
        browser,
        `${base}loading.sjs?document`
      );
      await TestUtils.waitForCondition(
        () => browser.webProgress.isLoadingDocument
      );
      browser.focus();
      await keys("tvj");
      Assert.equal(gModalNavigation.mode, "select");
      Assert.deepEqual(gBrowser.selectedTabs, [anchor, other]);
      await finish();
      Assert.equal(
        gModalNavigation.mode,
        "select",
        "Committing and completing the navigation preserves tab selection mode"
      );
      Assert.equal(gModalNavigation.tabs.selectionAnchor, anchor);
      Assert.equal(gModalNavigation.tabs.selectionCursor, other);
      Assert.deepEqual(gBrowser.selectedTabs, [anchor, other]);
      await keys("k");
      Assert.deepEqual(
        gBrowser.selectedTabs,
        [anchor],
        "Selection commands still work after the load"
      );
      await BrowserTestUtils.switchTab(gBrowser, other);
      Assert.equal(
        gModalNavigation.mode,
        "command",
        "Switching tabs still exits selection mode"
      );
      Assert.ok(!gModalNavigation.tabs.selectionCursor);
    } finally {
      if (!finished) {
        await finish();
      }
      gModalNavigation.enterCommand();
      gBrowser.clearMultiSelectedTabs();
      await BrowserTestUtils.removeTab(other);
    }
  });
});

add_task(async function select_current_group_without_switching_tabs() {
  const tabs = [];
  try {
    for (let i = 0; i < 4; i++) {
      tabs.push(
        await BrowserTestUtils.openNewForegroundTab(gBrowser, "about:blank")
      );
    }
    const [outside, a, b, c] = tabs;
    const group = gBrowser.addTabGroup([a, b, c], { insertBefore: a });
    await activate(outside);
    await keys("tgs");
    Assert.deepEqual(
      gBrowser.selectedTabs,
      [outside],
      "Selecting a group does nothing on an ungrouped tab"
    );
    await activate(b);
    gBrowser.addToMultiSelectedTabs(outside);
    gBrowser.addToMultiSelectedTabs(b);
    group.collapsed = true;
    await keys("tgs");
    Assert.deepEqual(
      gBrowser.selectedTabs,
      [a, b, c],
      "tgs replaces the selection with the current group"
    );
    Assert.equal(gBrowser.selectedTab, b, "The displayed tab stays unchanged");
    Assert.ok(
      !group.collapsed,
      "A folded group unfolds so its members are selected"
    );
    Assert.equal(
      gModalNavigation.mode,
      "command",
      "The selection is immediately available to group commands"
    );
    await keys("tgs");
    Assert.deepEqual(
      gBrowser.selectedTabs,
      [a, b, c],
      "Repeating the command retains the same selection"
    );
  } finally {
    gBrowser.clearMultiSelectedTabs();
    gModalNavigation.enterCommand();
    for (const tab of tabs) {
      await BrowserTestUtils.removeTab(tab);
    }
  }
});

add_task(async function split_members_are_selected_and_grouped_individually() {
  const tabs = [];
  try {
    for (let i = 0; i < 3; i++) {
      tabs.push(
        await BrowserTestUtils.openNewForegroundTab(gBrowser, "about:blank")
      );
    }
    const [a, b, c] = tabs;
    const split = gBrowser.addTabSplitView([b, c], { insertBefore: b });
    await activate(a);
    await keys("tvj");
    Assert.deepEqual(
      gBrowser.selectedTabs,
      [a, b],
      "Selecting one split member leaves its partner out"
    );
    Assert.ok(b.multiselected && !c.multiselected);
    Assert.ok(
      !split.multiselected,
      "The whole split is not marked as selected"
    );
    await keys("j");
    Assert.deepEqual(gBrowser.selectedTabs, [a, b, c]);
    Assert.ok(
      split.multiselected,
      "The whole split is marked only when both members are selected"
    );
    await keys("k");
    Assert.deepEqual(gBrowser.selectedTabs, [a, b]);
    Assert.ok(!c.multiselected && !split.multiselected);
    await keys("j");
    EventUtils.synthesizeKey("KEY_Escape");
    const menu = gBrowser.tabGroupMenu;
    let shown = BrowserTestUtils.waitForEvent(menu.panel, "popupshown");
    await keys("tgn");
    await shown;
    const sourceGroup = a.group;
    Assert.equal(
      b.splitview,
      split,
      "Grouping both split members preserves the split"
    );
    Assert.deepEqual(sourceGroup.tabs, [a, b, c]);
    let hidden = BrowserTestUtils.waitForEvent(menu.panel, "popuphidden");
    EventUtils.synthesizeKey("KEY_Enter");
    await hidden;

    sourceGroup.collapsed = true;
    await activate(b);
    await keys("tv");
    Assert.deepEqual(
      gBrowser.selectedTabs,
      [b],
      "Starting selection in a split selects only the active member"
    );
    EventUtils.synthesizeKey("KEY_Escape");
    shown = BrowserTestUtils.waitForEvent(menu.panel, "popupshown");
    await keys("tgn");
    await shown;
    Assert.deepEqual(
      b.group.tabs,
      [b],
      "A new group receives only the selected split member"
    );
    Assert.ok(
      !b.splitview && !c.splitview,
      "The partial split is separated before grouping"
    );
    Assert.equal(
      c.group,
      sourceGroup,
      "The unselected partner stays in its original group"
    );
    Assert.deepEqual(sourceGroup.tabs, [a, c]);
    Assert.ok(
      sourceGroup.collapsed,
      "Separating the selected member preserves source-group folding"
    );
    Assert.ok(c.isOpen);
    hidden = BrowserTestUtils.waitForEvent(menu.panel, "popuphidden");
    EventUtils.synthesizeKey("KEY_Enter");
    await hidden;
  } finally {
    gBrowser.tabGroupMenu.close();
    gBrowser.clearMultiSelectedTabs();
    gModalNavigation.enterCommand();
    for (const tab of tabs) {
      await BrowserTestUtils.removeTab(tab);
    }
  }
});

add_task(async function moving_a_partial_split_to_an_existing_group() {
  const tabs = [];
  try {
    for (let i = 0; i < 4; i++) {
      tabs.push(
        await BrowserTestUtils.openNewForegroundTab(gBrowser, "about:blank")
      );
    }
    const [a, b, c, d] = tabs;
    const split = gBrowser.addTabSplitView([b, c], { insertBefore: b });
    const sourceGroup = gBrowser.addTabGroup([split], {
      insertBefore: split,
      label: "Source",
    });
    const destination = gBrowser.addTabGroup([d], {
      label: "Split destination",
    });
    destination.collapsed = true;
    await activate(a);
    await keys("tvj");
    EventUtils.synthesizeKey("KEY_Escape");
    await keys("tgm");
    await TestUtils.waitForCondition(
      () => gModalNavigation.urlbar.mode === "group-move"
    );
    EventUtils.synthesizeKey("KEY_Escape");
    await TestUtils.waitForCondition(() => gModalNavigation.mode === "command");
    Assert.equal(
      b.splitview,
      split,
      "Canceling the picker does not separate the split"
    );
    await keys("tgm");
    await TestUtils.waitForCondition(
      () => gModalNavigation.urlbar.mode === "group-move"
    );
    await UrlbarTestUtils.promiseAutocompleteResultPopup({
      window,
      value: "Split destination",
    });
    EventUtils.synthesizeKey("KEY_Enter");
    await TestUtils.waitForCondition(
      () => a.group === destination && b.group === destination
    );
    Assert.equal(
      c.group,
      sourceGroup,
      "Moving a partial split leaves its partner in the source group"
    );
    Assert.ok(c.isOpen && !c.splitview && !b.splitview);
    Assert.ok(destination.collapsed);
    Assert.equal(destination.tabs.length, 3);
  } finally {
    gBrowser.clearMultiSelectedTabs();
    gModalNavigation.enterCommand();
    for (const tab of tabs) {
      await BrowserTestUtils.removeTab(tab);
    }
  }
});

add_task(async function closing_a_selected_split_member_keeps_its_partner() {
  const anchor = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:blank"
  );
  const a = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:blank"
  );
  const b = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:blank"
  );
  try {
    gBrowser.addTabSplitView([a, b], { insertBefore: a });
    await activate(anchor);
    await keys("tvj");
    Assert.deepEqual(gBrowser.selectedTabs, [anchor, a]);
    EventUtils.synthesizeKey("KEY_Escape");
    const closed = Promise.all(
      [anchor, a].map(tab => BrowserTestUtils.waitForEvent(tab, "TabClose"))
    );
    await keys("tgu");
    Assert.ok(
      a.splitview && b.splitview,
      "Ungrouping an already ungrouped selection leaves the split intact"
    );
    await keys("tq");
    await closed;
    Assert.ok(
      b.isOpen,
      "Closing the selected member does not close its partner"
    );
  } finally {
    gModalNavigation.enterCommand();
    for (const tab of [anchor, a, b]) {
      if (tab.isOpen) {
        await BrowserTestUtils.removeTab(tab);
      }
    }
  }
});

add_task(async function selection_mode_has_a_distinct_toolbar_fill() {
  await BrowserTestUtils.withNewTab("about:blank", async () => {
    const toolbar = document.getElementById("nav-bar");
    gModalNavigation.enterCommand();
    const normal = getComputedStyle(toolbar).backgroundColor;
    await keys("tv");
    const selection = getComputedStyle(toolbar).backgroundColor;
    Assert.notEqual(
      selection,
      normal,
      "Selection mode visibly changes the toolbar"
    );
    EventUtils.synthesizeKey("KEY_Escape");
    Assert.equal(
      getComputedStyle(toolbar).backgroundColor,
      normal,
      "Escape removes the selection tint"
    );
    await keys("i");
    Assert.notEqual(
      getComputedStyle(toolbar).backgroundColor,
      selection,
      "Selection and insert modes have distinct colours"
    );
    EventUtils.synthesizeKey("KEY_Escape");
  });
});

add_task(async function selected_tabs_group_and_move_together() {
  const tabs = [];
  try {
    for (let i = 0; i < 3; i++) {
      tabs.push(
        await BrowserTestUtils.openNewForegroundTab(gBrowser, "about:blank")
      );
    }
    const [a, b, c] = tabs;
    await activate(a);
    await keys("tvj");
    EventUtils.synthesizeKey("KEY_Escape");
    const menu = gBrowser.tabGroupMenu;
    const shown = BrowserTestUtils.waitForEvent(menu.panel, "popupshown");
    await keys("tgn");
    await shown;
    Assert.deepEqual(
      a.group.tabs,
      [a, b],
      "Native creation receives the whole selection"
    );
    const hidden = BrowserTestUtils.waitForEvent(menu.panel, "popuphidden");
    EventUtils.synthesizeKey("KEY_Enter");
    await hidden;
    const target = gBrowser.addTabGroup([c], {
      label: "Selection destination",
    });
    target.collapsed = true;
    await activate(a);
    await keys("tvj");
    EventUtils.synthesizeKey("KEY_Escape");
    await keys("tgm");
    await TestUtils.waitForCondition(
      () => gModalNavigation.urlbar.mode === "group-move"
    );
    await UrlbarTestUtils.promiseAutocompleteResultPopup({
      window,
      value: "Selection destination",
    });
    EventUtils.synthesizeKey("KEY_Enter");
    await TestUtils.waitForCondition(
      () => a.group === target && b.group === target
    );
    Assert.equal(target.tabs.length, 3);
    Assert.ok(
      target.collapsed,
      "Moving multiple tabs preserves the destination's folding"
    );
  } finally {
    gBrowser.tabGroupMenu.close();
    gBrowser.clearMultiSelectedTabs();
    gModalNavigation.enterCommand();
    for (const tab of tabs) {
      await BrowserTestUtils.removeTab(tab);
    }
  }
});

add_task(async function movement_preserves_selected_blocks_and_groups() {
  const tabs = [];
  try {
    for (let i = 0; i < 7; i++) {
      tabs.push(
        await BrowserTestUtils.openNewForegroundTab(gBrowser, "about:blank")
      );
    }
    const [a, b, c, d, e, f, g] = tabs;
    const order = () => gBrowser.tabs.filter(tab => tabs.includes(tab));
    const select = async selected => {
      await activate(selected[0]);
      gModalNavigation.tabs.replaceSelection(selected);
    };
    await select([a, c]);
    await keys("tJ");
    Assert.deepEqual(
      order(),
      [b, d, a, c, e, f, g],
      "Close gaps and cross one tab"
    );
    Assert.deepEqual(gBrowser.selectedTabs, [a, c], "Keep the selection");
    Assert.equal(gBrowser.selectedTab, a, "Keep the active tab");
    await keys("2tK");
    Assert.deepEqual(
      order(),
      [a, c, b, d, e, f, g],
      "Count from the block's leading edge"
    );
    await keys("tL");
    Assert.deepEqual(
      order(),
      [b, d, e, f, g, a, c],
      "Move the whole block to the end"
    );
    await keys("tH");
    Assert.deepEqual(
      order(),
      [a, c, b, d, e, f, g],
      "Move the whole block to the start"
    );

    gBrowser.moveTabsBefore([a, c], b);
    const group = gBrowser.addTabGroup([a, c, b], {
      insertBefore: a,
      label: "Stationary",
    });
    await select([a, b]);
    await keys("tJ");
    Assert.deepEqual(
      order(),
      [c, a, b, d, e, f, g],
      "Outer members exit before crossing D"
    );
    Assert.deepEqual(group.tabs, [c], "The partial group stays behind");
    Assert.ok(!a.group && !b.group, "Moved members leave their group");
    Assert.deepEqual(
      gBrowser.selectedTabs,
      [a, b],
      "Extraction retains both selected tabs"
    );
    await keys("tJ");
    Assert.deepEqual(order(), [c, d, a, b, e, f, g], "The next move crosses D");
    group.addTabs([a, b]);
    await select([c, b]);
    await keys("tK");
    Assert.deepEqual(
      order(),
      [c, b, a, d, e, f, g],
      "Backward extraction is symmetric"
    );
    Assert.deepEqual(group.tabs, [a]);

    group.addTabs([c, b]);
    group.collapsed = true;
    const id = group.id;
    await select([a, c, b, e]);
    await keys("tJ");
    Assert.deepEqual(
      order(),
      [d, f, a, c, b, e, g],
      "A full group travels with the block"
    );
    Assert.deepEqual(
      group.tabs,
      [a, c, b],
      "Group membership and order survive"
    );
    Assert.equal(group.id, id, "Keep group identity");
    Assert.ok(group.collapsed, "Keep folding");
    Assert.equal(group.label, "Stationary", "Keep the label");
    await keys("tL");
    Assert.deepEqual(
      order(),
      [d, f, g, a, c, b, e],
      "Endpoint movement keeps the group"
    );
    await keys("tH");
    Assert.deepEqual(
      order(),
      [a, c, b, e, d, f, g],
      "Backward endpoint keeps block order"
    );
    Assert.deepEqual(gBrowser.selectedTabs, [a, c, b, e]);
  } finally {
    gBrowser.clearMultiSelectedTabs();
    for (const tab of tabs) {
      await BrowserTestUtils.removeTab(tab);
    }
  }
});

add_task(async function movement_splits_pins_and_group_scopes() {
  const tabs = [];
  try {
    for (let i = 0; i < 6; i++) {
      tabs.push(
        await BrowserTestUtils.openNewForegroundTab(gBrowser, "about:blank")
      );
    }
    const [a, b, c, d, e, f] = tabs;
    const order = () => gBrowser.tabs.filter(tab => tabs.includes(tab));
    const select = async selected => {
      await activate(selected[0]);
      gModalNavigation.tabs.replaceSelection(selected);
    };
    gBrowser.addTabSplitView([a, b], { insertBefore: a });
    const group = gBrowser.addTabGroup([a.splitview, c], {
      insertBefore: a.splitview,
    });
    await select([a]);
    await keys("tJ");
    Assert.ok(
      !a.splitview && !b.splitview,
      "A partially selected split detaches"
    );
    Assert.deepEqual(
      group.tabs,
      [b, c],
      "The partner stays in its original group"
    );
    Assert.deepEqual(order(), [b, c, a, d, e, f]);
    const split = gBrowser.addTabSplitView([d, e], { insertBefore: d });
    await select([d, e]);
    await keys("tJ");
    Assert.equal(d.splitview, split, "A fully selected split stays intact");
    Assert.deepEqual(order(), [b, c, a, f, d, e]);

    group.addTabs([a, f]);
    await select([b, a]);
    await keys("tgJ");
    Assert.deepEqual(
      group.tabs,
      [c, f, b, a],
      "Reorder the selected block within its group"
    );
    await keys("tgJ");
    Assert.deepEqual(
      group.tabs,
      [b, a, c, f],
      "The block wraps within the group"
    );
    await keys("tgL");
    Assert.deepEqual(group.tabs, [c, f, b, a]);
    await keys("tgH");
    Assert.deepEqual(group.tabs, [b, a, c, f]);
    await select([b, a, c, f]);
    await keys("999tgJ");
    Assert.deepEqual(
      group.tabs,
      [b, a, c, f],
      "A wholly selected group cannot reorder itself"
    );

    gBrowser.pinTab(b);
    gBrowser.pinTab(a);
    gBrowser.pinTab(c);
    await select([b, c, d, e]);
    await keys("tL");
    Assert.deepEqual(
      order(),
      [a, b, c, f, d, e],
      "Mixed selections stay in their pinned sections"
    );
    Assert.ok(b.pinned && c.pinned && !d.pinned && !e.pinned);
    await keys("tH");
    Assert.deepEqual(order(), [b, c, a, d, e, f]);
    Assert.deepEqual(gBrowser.selectedTabs, [b, c, d, e]);
  } finally {
    gBrowser.clearMultiSelectedTabs();
    for (const tab of tabs) {
      await BrowserTestUtils.removeTab(tab);
    }
  }
});

add_task(async function moving_multiple_groups_does_not_merge_them() {
  const tabs = [];
  try {
    for (let i = 0; i < 6; i++) {
      tabs.push(
        await BrowserTestUtils.openNewForegroundTab(gBrowser, "about:blank")
      );
    }
    const [a, b, c, d, e, f] = tabs;
    const left = gBrowser.addTabGroup([a, b], { insertBefore: a });
    const right = gBrowser.addTabGroup([d, e], { insertBefore: d });
    const order = () => gBrowser.tabs.filter(tab => tabs.includes(tab));
    await activate(a);
    gModalNavigation.tabs.replaceSelection([a, b, c]);
    await keys("tJ");
    Assert.deepEqual(
      order(),
      [d, e, a, b, c, f],
      "Whole groups cross expanded groups as a unit"
    );
    Assert.deepEqual(left.tabs, [a, b]);
    Assert.deepEqual(
      right.tabs,
      [d, e],
      "The destination group does not absorb the block"
    );

    gModalNavigation.tabs.replaceSelection([d, a]);
    await keys("tgL");
    Assert.deepEqual(
      order(),
      [e, d, b, a, c, f],
      "Group-scoped moves act in every selected group"
    );
    Assert.deepEqual(gBrowser.selectedTabs, [d, a]);
    gModalNavigation.tabs.replaceSelection([e, d, b, a]);
    await keys("tL");
    Assert.deepEqual(
      order(),
      [c, f, e, d, b, a],
      "Both groups move intact in strip order"
    );
    await keys("999tJ");
    Assert.deepEqual(
      order(),
      [c, f, e, d, b, a],
      "A boundary move preserves group order"
    );
    Assert.deepEqual(right.tabs, [e, d]);
    Assert.deepEqual(left.tabs, [b, a]);
    gBrowser.hideTab(f);
    await keys("tK");
    Assert.deepEqual(
      order().filter(tab => tab !== f),
      [e, d, b, a, c],
      "Hidden tabs do not consume steps"
    );
    Assert.equal(gBrowser.selectedTab, a);
  } finally {
    gBrowser.clearMultiSelectedTabs();
    for (const tab of tabs) {
      await BrowserTestUtils.removeTab(tab);
    }
  }
});

add_task(async function new_and_close_tab_shortcuts() {
  const original = gBrowser.selectedTab;
  const created = [];
  try {
    gModalNavigation.enterCommand();
    for (let i = 0; i < 2; i++) {
      const opened = BrowserTestUtils.waitForNewTab(gBrowser);
      await keys("tn");
      created.push(await opened);
      await TestUtils.waitForCondition(() => gURLBar.focused);
      EventUtils.synthesizeKey("KEY_Escape");
      await TestUtils.waitForCondition(
        () => gModalNavigation.mode === "command"
      );
    }
    const count = gBrowser.tabs.length;
    for (const mode of ["command", "insert", "select"]) {
      gModalNavigation.setMode(mode);
      EventUtils.synthesizeKey("t", { ctrlKey: true });
      EventUtils.synthesizeKey("t", { ctrlKey: true, shiftKey: true });
      if (mode !== "command") {
        EventUtils.synthesizeKey("w", { ctrlKey: true });
      }
      await TestUtils.waitForTick();
      Assert.equal(
        gBrowser.tabs.length,
        count,
        `Retired shortcuts do not open or close tabs in ${mode} mode`
      );
    }
    await activate(created[0]);
    await keys("tvj");
    EventUtils.synthesizeKey("KEY_Escape");
    const closed = created.map(tab =>
      BrowserTestUtils.waitForEvent(tab, "TabClose")
    );
    await keys("tq");
    await Promise.all(closed);
    Assert.ok(
      created.every(tab => !tab.isOpen),
      "tq closes all selected tabs"
    );
    Assert.ok(original.isOpen, "An unselected tab remains open");
  } finally {
    gModalNavigation.enterCommand();
    for (const tab of created) {
      if (tab.isOpen) {
        await BrowserTestUtils.removeTab(tab);
      }
    }
  }
});

add_task(async function new_tab_before_current() {
  for (const insertAfterCurrent of [false, true]) {
    await SpecialPowers.pushPrefEnv({
      set: [["browser.tabs.insertAfterCurrent", insertAfterCurrent]],
    });
    const original = gBrowser.selectedTab;
    let tab;
    try {
      gModalNavigation.enterCommand();
      const index = original.index;
      const opened = BrowserTestUtils.waitForNewTab(gBrowser);
      await keys("tN");
      tab = await opened;
      Assert.equal(tab.index, index, "tN inserts before the current tab");
      Assert.equal(original.index, index + 1, "The original tab follows it");
      Assert.equal(gBrowser.selectedTab, tab, "The new tab is selected");
      await TestUtils.waitForCondition(() => gURLBar.focused);
    } finally {
      if (tab) {
        await BrowserTestUtils.removeTab(tab);
      }
      gModalNavigation.enterCommand();
      await SpecialPowers.popPrefEnv();
    }
  }
});
