/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global gModalNavigation */

const BOOKMARK_PAGE =
  "https://example.com/browser/browser/components/modal/tests/browser/page.html";
const { PlacesTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/PlacesTestUtils.sys.mjs"
);

add_task(async function bookmark_shortcut_and_labels() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.bookmarks.editDialog.showForNewBookmarks", true],
      ["browser.bookmarks.editDialog.confirmationHintShowCount", 3],
    ],
  });
  await BrowserTestUtils.withNewTab(BOOKMARK_PAGE, async browser => {
    StarUI._createPanelIfNeeded();
    const panel = document.getElementById("editBookmarkPanel");
    try {
      await TestUtils.waitForCondition(
        () => BookmarkingUI.status === BookmarkingUI.STATUS_UNSTARRED
      );
      browser.focus();
      EventUtils.synthesizeKey("d", { ctrlKey: true });
      await SpecialPowers.spawn(browser, [], async () => {
        await ContentTaskUtils.waitForCondition(() => content.scrollY > 0);
      });
      Assert.equal(panel.state, "closed", "Ctrl-d scrolls without bookmarking");
      Assert.ok(!(await PlacesUtils.bookmarks.fetch({ url: BOOKMARK_PAGE })));

      EventUtils.synthesizeKey(" ");
      EventUtils.synthesizeKey("m");
      await TestUtils.waitForCondition(() => gURLBar.focused);
      Assert.equal(gModalNavigation.urlbar.mode, "bookmarks");
      EventUtils.synthesizeKey("KEY_Escape");
      await TestUtils.waitForCondition(
        () => document.activeElement === browser
      );

      for (const isNew of [true, false]) {
        await document.l10n.translateElements([BookmarkingUI.starBox]);
        Assert.ok(
          BookmarkingUI.starBox
            .getAttribute("tooltiptext")
            .includes("(Space M)"),
          "The star tooltip shows the new shortcut for adding and editing"
        );
        Assert.equal(
          document
            .getElementById("menu_bookmarkThisPage")
            .getAttribute("acceltext"),
          "Space M",
          "The Bookmarks menu shows the new shortcut"
        );
        const contextItem = document.getElementById("context-bookmarkpage");
        if (AppConstants.platform !== "macosx") {
          await document.l10n.translateElements([contextItem]);
          Assert.ok(
            contextItem.getAttribute("tooltiptext").includes("(Space M)"),
            "The context menu shows the new shortcut"
          );
        }

        if (isNew) {
          const menuShown = BrowserTestUtils.waitForEvent(
            PanelUI.panel,
            "popupshown"
          );
          await PanelUI.show();
          await menuShown;
          const view = PanelMultiView.getViewNode(
            document,
            "PanelUI-bookmarks"
          );
          const viewShown = BrowserTestUtils.waitForEvent(view, "ViewShown");
          document.getElementById("appMenu-bookmarks-button").click();
          await viewShown;
          const hidden = BrowserTestUtils.waitForEvent(
            PanelUI.panel,
            "popuphidden"
          );
          PanelUI.hide();
          await hidden;
          gModalNavigation.enterCommand();
        }
        Assert.equal(
          PanelMultiView.getViewNode(
            document,
            "panelMenuBookmarkThisPage"
          ).getAttribute("shortcut"),
          "Space M",
          "The app menu shows the new shortcut"
        );
        const shown = BrowserTestUtils.waitForEvent(panel, "popupshown");
        EventUtils.synthesizeKey("3");
        EventUtils.synthesizeKey(" ");
        EventUtils.synthesizeKey("M", { shiftKey: true });
        await shown;
        Assert.equal(
          document.getElementById("editBookmarkPanelTitle").dataset.l10nId,
          isNew ? "bookmarks-add-bookmark" : "bookmarks-edit-bookmark"
        );
        const saved = BrowserTestUtils.waitForEvent(panel, "popuphidden");
        const added = isNew
          ? PlacesTestUtils.waitForNotification("bookmark-added", events =>
              events.some(event => event.url === BOOKMARK_PAGE)
            )
          : Promise.resolve();
        document.getElementById("editBookmarkPanelDoneButton").click();
        await Promise.all([saved, added]);
        await TestUtils.waitForCondition(
          () => BookmarkingUI.status === BookmarkingUI.STATUS_STARRED
        );
        const bookmarks = [];
        await PlacesUtils.bookmarks.fetch({ url: BOOKMARK_PAGE }, bookmark =>
          bookmarks.push(bookmark)
        );
        Assert.equal(
          bookmarks.length,
          1,
          "Counts and editing do not duplicate bookmarks"
        );
        gModalNavigation.enterCommand();
      }
      Assert.ok(
        !document.querySelector('key[command="Browser:AddBookmarkAs"]'),
        "The obsolete native bookmark shortcut is retired"
      );
    } finally {
      PanelUI.hide();
      if (panel.state !== "closed") {
        const hidden = BrowserTestUtils.waitForEvent(panel, "popuphidden");
        panel.hidePopup();
        await hidden;
      }
      const bookmark = await PlacesUtils.bookmarks.fetch({
        url: BOOKMARK_PAGE,
      });
      if (bookmark) {
        await PlacesUtils.bookmarks.remove(bookmark);
      }
      gModalNavigation.enterCommand();
    }
  });
  await SpecialPowers.popPrefEnv();
});
