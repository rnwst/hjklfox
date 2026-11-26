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

async function withTabs(task) {
  const tabs = [];
  try {
    for (let i = 0; i < 3; i++) {
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
      await BrowserTestUtils.removeTab(tab);
    }
  }
}

function assertMuted(tab, muted) {
  Assert.equal(tab.linkedBrowser.audioMuted, muted, "Native audio mute state");
  Assert.equal(tab.hasAttribute("muted"), muted, "Tab mute indicator");
}

function assertSelection(tabs, active) {
  Assert.deepEqual(gBrowser.selectedTabs, tabs, "Selection is retained");
  Assert.equal(gBrowser.selectedTab, active, "The active tab is retained");
  Assert.equal(gModalNavigation.mode, "command");
  Assert.equal(
    document.activeElement,
    active.linkedBrowser,
    "Page keeps focus"
  );
}

add_task(async function current_tab_muting_is_idempotent_and_ignores_counts() {
  await withTabs(async ([a, b, tab]) => {
    for (const sequence of ["2tm", "tm", "2tM", "tM"]) {
      await keys(sequence);
      assertMuted(tab, sequence.endsWith("m"));
      assertMuted(a, false);
      assertMuted(b, false);
      assertSelection([tab], tab);
    }
  });
});

add_task(async function muting_only_affects_the_current_multiselected_tab() {
  await withTabs(async ([a, b, tab]) => {
    a.toggleMuteAudio();
    await keys("tv2k");
    EventUtils.synthesizeKey("KEY_Escape");
    for (const sequence of ["tm", "tM"]) {
      await keys(sequence);
      assertMuted(tab, sequence === "tm");
      assertMuted(a, true);
      assertMuted(b, false);
      assertSelection([a, b, tab], tab);
    }
  });
});

add_task(async function muting_requires_command_mode_and_a_complete_sequence() {
  await withTabs(async ([, , tab]) => {
    await keys("i");
    await keys("tm");
    assertMuted(tab, false);
    EventUtils.synthesizeKey("KEY_Escape");
    await keys("t");
    EventUtils.synthesizeKey("KEY_Escape");
    await keys("m");
    assertMuted(tab, false);

    await keys("tm");
    assertMuted(tab, true);
    await keys("i");
    await keys("tM");
    assertMuted(tab, true);
    EventUtils.synthesizeKey("KEY_Escape");
    await keys("t");
    EventUtils.synthesizeKey("KEY_Escape");
    await keys("M");
    assertMuted(tab, true);
    await keys("tM");
    assertMuted(tab, false);
  });
});
