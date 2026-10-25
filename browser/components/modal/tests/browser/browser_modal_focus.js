/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global gModalNavigation */

const FOCUS_PAGE =
  "https://example.com/browser/browser/components/modal/tests/browser/page.html";

add_task(async function tab_keeps_address_editing_without_entering_chrome() {
  await BrowserTestUtils.withNewTab(FOCUS_PAGE, async browser => {
    for (const shiftKey of [false, true]) {
      browser.focus();
      EventUtils.synthesizeKey(" ");
      EventUtils.synthesizeKey("f");
      await TestUtils.waitForCondition(() => gURLBar.focused);
      EventUtils.sendString("unfinished query");
      EventUtils.synthesizeKey("KEY_Tab", { shiftKey });
      Assert.equal(
        document.activeElement,
        gURLBar.inputField,
        "Tab keeps focus in the address field"
      );
      Assert.equal(gModalNavigation.mode, "address");
      Assert.equal(
        gURLBar.value,
        "unfinished query",
        "Tab preserves unfinished address text"
      );
      EventUtils.synthesizeKey("KEY_Escape");
      await TestUtils.waitForCondition(
        () => document.activeElement === browser
      );
      Assert.equal(gModalNavigation.mode, "command");
      EventUtils.synthesizeKey("j");
      await SpecialPowers.spawn(browser, [], async () => {
        await ContentTaskUtils.waitForCondition(() => content.scrollY > 0);
        content.scrollTo(0, 0);
      });
    }
    for (const shiftKey of [false, true]) {
      for (let i = 0; i < 8; i++) {
        EventUtils.synthesizeKey("KEY_Tab", { shiftKey });
        await SpecialPowers.spawn(browser, [], () => {});
        Assert.equal(
          document.activeElement,
          browser,
          "Repeated Tab navigation stays in the page"
        );
      }
    }
  });
});

add_task(async function navigation_controls_reject_mouse_and_script_focus() {
  await BrowserTestUtils.withNewTab(FOCUS_PAGE, async browser => {
    browser.focus();
    const controls = [
      document.getElementById("fxa-toolbar-menu-button"),
      document.getElementById("tabs-newtab-button"),
      document.getElementById("PanelUI-menu-button"),
      gBrowser.selectedTab,
    ];
    for (const control of controls) {
      Assert.ok(control, "The navigation control exists");
      control.focus();
      Assert.equal(
        document.activeElement,
        browser,
        "Programmatic focus cannot leave the page for navigation chrome"
      );
      Services.focus.setFocus(control, Ci.nsIFocusManager.FLAG_BYKEY);
      Assert.equal(
        document.activeElement,
        browser,
        "Focus-manager requests cannot focus navigation chrome"
      );
    }
    EventUtils.synthesizeMouseAtCenter(gBrowser.selectedTab, {});
    await SpecialPowers.spawn(browser, [], () => {});
    Assert.equal(
      document.activeElement,
      browser,
      "Clicking the selected tab does not focus its title"
    );
    EventUtils.synthesizeKey("g");
    EventUtils.synthesizeKey("w");
    await TestUtils.waitForCondition(
      () => gModalNavigation.hints?.targets.length === 2
    );
    EventUtils.synthesizeKey("KEY_Escape");
  });
});

add_task(async function tab_on_the_reference_page_keeps_commands_available() {
  await BrowserTestUtils.withNewTab("about:newtab", async browser => {
    browser.focus();
    for (const shiftKey of [false, true]) {
      for (let i = 0; i < 4; i++) {
        EventUtils.synthesizeKey("KEY_Tab", { shiftKey });
        await SpecialPowers.spawn(browser, [], () => {});
        Assert.ok(
          !document.activeElement.closest("#navigator-toolbox"),
          "Tab does not enter browser chrome on a page without controls"
        );
      }
    }
    EventUtils.synthesizeKey(" ");
    EventUtils.synthesizeKey("f");
    await TestUtils.waitForCondition(() => gURLBar.focused);
    Assert.equal(gModalNavigation.urlbar.mode, "destinations");
    EventUtils.synthesizeKey("KEY_Escape");
    await TestUtils.waitForCondition(() => document.activeElement === browser);
  });
});

add_task(async function shadow_controls_cannot_bypass_the_focus_guard() {
  await BrowserTestUtils.withNewTab(FOCUS_PAGE, async browser => {
    browser.focus();
    const host = document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "div"
    );
    document.getElementById("nav-bar").append(host);
    const shadow = host.attachShadow({ mode: "open" });
    const input = document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "input"
    );
    input.style.setProperty("-moz-user-focus", "normal", "important");
    shadow.append(input);
    try {
      input.focus();
      Assert.equal(
        document.activeElement,
        browser,
        "A shadow control cannot retain chrome focus"
      );
      Assert.equal(gModalNavigation.mode, "command");
    } finally {
      host.remove();
    }
  });
});

add_task(async function hover_previews_do_not_block_modal_commands() {
  await BrowserTestUtils.withNewTab(FOCUS_PAGE, async browser => {
    browser.focus();
    EventUtils.synthesizeKey(" ");
    const preview = document.createXULElement("panel");
    preview.setAttribute("role", "tooltip");
    preview.setAttribute("noautofocus", "true");
    preview.setAttribute("nonnative", "");
    const label = document.createXULElement("label");
    label.setAttribute("value", "Tab hover preview");
    preview.append(label);
    document.getElementById("mainPopupSet").append(preview);
    try {
      const shown = BrowserTestUtils.waitForEvent(preview, "popupshown");
      preview.openPopup(document.getElementById("nav-bar"), "after_start");
      await shown;
      Assert.equal(
        gModalNavigation.keymap.prefix,
        "Space",
        "A hover preview does not cancel the command prefix"
      );
      EventUtils.synthesizeKey("f");
      await TestUtils.waitForCondition(() => gURLBar.focused);
      Assert.equal(gModalNavigation.urlbar.mode, "destinations");
    } finally {
      if (preview.state !== "closed") {
        const hidden = BrowserTestUtils.waitForEvent(preview, "popuphidden");
        preview.hidePopup();
        await hidden;
      }
      preview.remove();
      await SimpleTest.promiseFocus(window);
      EventUtils.synthesizeKey("KEY_Escape");
      await TestUtils.waitForCondition(
        () => document.activeElement === browser
      );
    }
  });
});

add_task(async function intentional_editors_remain_usable() {
  await BrowserTestUtils.withNewTab(FOCUS_PAGE, async browser => {
    browser.focus();
    EventUtils.synthesizeMouseAtCenter(gURLBar.inputField, {});
    await TestUtils.waitForCondition(
      () => gURLBar.focused,
      "Mouse focus reaches the address field"
    );
    Assert.equal(
      gModalNavigation.mode,
      "address",
      "The address field still accepts explicit focus"
    );
    info("Leaving the mouse-focused address field");
    EventUtils.synthesizeKey("KEY_Escape");
    await TestUtils.waitForCondition(() => document.activeElement === browser);
    info("Opening the find field");
    EventUtils.synthesizeKey("/");
    const findbar = await gFindBarPromise;
    await TestUtils.waitForCondition(
      () => document.activeElement === findbar._findField,
      "Slash focuses the find field"
    );
    info("Leaving the find field with Tab");
    EventUtils.synthesizeKey("KEY_Tab");
    await TestUtils.waitForCondition(() => document.activeElement === browser);
    Assert.equal(
      gModalNavigation.mode,
      "command",
      "Tab leaves the find field for the page"
    );
    Assert.ok(findbar.hidden);
    findbar._findField.focus();
    Assert.equal(
      document.activeElement,
      browser,
      "A closing find field cannot reclaim focus"
    );
    await BrowserTestUtils.synthesizeMouseAtCenter("#editor", {}, browser);
    await TestUtils.waitForCondition(
      () => gModalNavigation.mode === "insert",
      "Page editors remain focusable"
    );
    EventUtils.sendString("page typing");
    await SpecialPowers.spawn(browser, [], () => {
      Assert.equal(
        content.document.getElementById("editor").value,
        "page typing"
      );
    });
  });
});

add_task(async function disabling_modal_navigation_restores_native_focus() {
  await BrowserTestUtils.withNewTab(FOCUS_PAGE, async browser => {
    browser.focus();
    await SpecialPowers.pushPrefEnv({
      set: [["browser.modal.enabled", false]],
    });
    try {
      gBrowser.selectedTab.focus();
      Assert.equal(
        document.activeElement,
        gBrowser.selectedTab,
        "Native tab focus returns when modal navigation is disabled"
      );
      Assert.equal(
        gURLBar.inputField.tabIndex,
        0,
        "The native address-bar tab stop is restored"
      );
    } finally {
      await SpecialPowers.popPrefEnv();
    }
    Assert.equal(
      document.activeElement,
      browser,
      "Enabling modal navigation recovers from existing chrome focus"
    );
    Assert.equal(gModalNavigation.mode, "command");
  });
});

add_task(
  async function returning_from_a_new_tab_does_not_restore_address_mode() {
    await BrowserTestUtils.withNewTab(FOCUS_PAGE, async browser => {
      const original = gBrowser.selectedTab;
      browser.focus();
      EventUtils.synthesizeKey(" ");
      EventUtils.synthesizeKey("f");
      await TestUtils.waitForCondition(() => gURLBar.focused);
      EventUtils.sendString("unfinished destination");
      const opened = BrowserTestUtils.waitForNewTab(gBrowser, "about:newtab");
      EventUtils.synthesizeKey("t", { accelKey: true });
      const other = await opened;
      try {
        await TestUtils.waitForCondition(
          () => gBrowser.selectedTab === other && gURLBar.focused
        );
        await BrowserTestUtils.switchTab(gBrowser, original);
        Assert.equal(
          document.activeElement,
          browser,
          "Returning to the source tab focuses the page"
        );
        Assert.equal(
          gModalNavigation.mode,
          "command",
          "Address mode is not restored from the tab"
        );
        EventUtils.synthesizeKey("j");
        await SpecialPowers.spawn(browser, [], async () => {
          await ContentTaskUtils.waitForCondition(() => content.scrollY > 0);
        });
        EventUtils.synthesizeKey(" ");
        EventUtils.synthesizeKey("e");
        await TestUtils.waitForCondition(() => gURLBar.focused);
        Assert.equal(
          gURLBar.value,
          "unfinished destination",
          "The query can still be resumed explicitly"
        );
        EventUtils.synthesizeKey("KEY_Escape");
        await TestUtils.waitForCondition(
          () => document.activeElement === browser
        );
        await BrowserTestUtils.switchTab(gBrowser, other);
        Assert.equal(
          document.activeElement,
          other.linkedBrowser,
          "Revisiting the new tab does not restore address focus either"
        );
        Assert.equal(gModalNavigation.mode, "command");
      } finally {
        BrowserTestUtils.removeTab(other);
      }
    });
  }
);

add_task(async function tab_switches_do_not_restore_find_field_focus() {
  await BrowserTestUtils.withNewTab(FOCUS_PAGE, async browser => {
    const original = gBrowser.selectedTab;
    const other = BrowserTestUtils.addTab(gBrowser, `${FOCUS_PAGE}?other`);
    try {
      browser.focus();
      EventUtils.synthesizeKey("/");
      const findbar = await gFindBarPromise;
      await TestUtils.waitForCondition(
        () => document.activeElement === findbar._findField
      );
      await findbar._startFindDeferred?.promise;
      Assert.equal(gModalNavigation.mode, "insert");
      await BrowserTestUtils.switchTab(gBrowser, other);
      await BrowserTestUtils.switchTab(gBrowser, original);
      Assert.equal(
        document.activeElement,
        browser,
        "Returning to a tab does not focus its find field"
      );
      Assert.equal(gModalNavigation.mode, "command");
      findbar.close(true);
    } finally {
      BrowserTestUtils.removeTab(other);
    }
  });
});

add_task(
  async function enabling_modal_navigation_clears_native_focus_memories() {
    await BrowserTestUtils.withNewTab(FOCUS_PAGE, async browser => {
      const original = gBrowser.selectedTab;
      const other = BrowserTestUtils.addTab(gBrowser, `${FOCUS_PAGE}?other`);
      try {
        await SpecialPowers.pushPrefEnv({
          set: [["browser.modal.enabled", false]],
        });
        try {
          gURLBar.focus();
          await BrowserTestUtils.switchTab(gBrowser, other);
          Assert.ok(
            gURLBar.getBrowserState(browser).urlbarFocused,
            "Native focus memory remains available with modal navigation disabled"
          );
        } finally {
          await SpecialPowers.popPrefEnv();
        }
        await BrowserTestUtils.switchTab(gBrowser, original);
        Assert.equal(
          document.activeElement,
          browser,
          "Enabling modal navigation discards stale address-focus memory"
        );
        Assert.equal(gModalNavigation.mode, "command");
      } finally {
        BrowserTestUtils.removeTab(other);
      }
    });
  }
);
