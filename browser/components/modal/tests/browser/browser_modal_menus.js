/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global gModalNavigation */

add_task(async function tab_context_menu_access_keys() {
  await BrowserTestUtils.withNewTab("about:blank", async browser => {
    const tab = gBrowser.selectedTab;
    const menu = document.getElementById("tabContextMenu");
    try {
      for (const mode of ["command", "insert"]) {
        browser.focus();
        gModalNavigation.setMode(mode);
        const shown = BrowserTestUtils.waitForEvent(menu, "popupshown");
        EventUtils.synthesizeMouseAtCenter(tab, {
          type: "contextmenu",
          button: 2,
        });
        await shown;
        const item = document.getElementById(
          tab.pinned ? "context_unpinTab" : "context_pinTab"
        );
        await document.l10n.translateElements([item]);
        const key = item.getAttribute("accesskey");
        Assert.ok(key, "The tab menu item has an access key");
        const wasPinned = tab.pinned;
        EventUtils.synthesizeKey(key.toLowerCase());
        await TestUtils.waitForCondition(
          () => tab.pinned !== wasPinned,
          `The access key works in ${mode} mode`
        );
        await TestUtils.waitForCondition(() => menu.state === "closed");
      }
    } finally {
      menu.hidePopup();
      gModalNavigation.setMode("command");
      browser.focus();
    }
  });
});
