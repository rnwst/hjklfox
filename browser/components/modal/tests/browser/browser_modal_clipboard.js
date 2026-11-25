/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global gModalNavigation */

const CLIPBOARD_PAGE =
  "https://example.com/browser/browser/components/modal/tests/browser/page.html";
const clipboardHelper = Cc["@mozilla.org/widget/clipboardhelper;1"].getService(
  Ci.nsIClipboardHelper
);
const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);

function clipboardKeys(sequence, win = window) {
  for (const key of sequence) {
    EventUtils.synthesizeKey(key, { shiftKey: /^[A-Z]$/.test(key) }, win);
  }
}

function setClipboard(text) {
  return SimpleTest.promiseClipboardChange(text, () =>
    clipboardHelper.copyString(text)
  );
}

async function clipboardError(id = "modal-clipboard-invalid-url") {
  const message = await document.l10n.formatValue(id);
  await TestUtils.waitForCondition(
    () =>
      document
        .getElementById("modal-clipboard-error")
        ?.matches(":popover-open") &&
      document.getElementById("modal-clipboard-error").textContent === message
  );
  return document.getElementById("modal-clipboard-error");
}

add_task(async function copy_loaded_url_not_address_draft() {
  const url = `${CLIPBOARD_PAGE}?q=hello%20world#fragment`;
  await BrowserTestUtils.withNewTab(url, async browser => {
    gURLBar.focus();
    EventUtils.sendString("unfinished address");
    EventUtils.synthesizeKey("KEY_Escape");
    await TestUtils.waitForCondition(() => document.activeElement === browser);
    await SimpleTest.promiseClipboardChange(url, () => clipboardKeys("3 y"));
    Assert.equal(gModalNavigation.mode, "command");
    Assert.equal(document.activeElement, browser);
  });
});

add_task(async function new_and_current_tab_keep_container_context() {
  await BrowserTestUtils.withNewTab(
    {
      gBrowser,
      opening() {
        gBrowser.selectedTab = BrowserTestUtils.addTab(
          gBrowser,
          CLIPBOARD_PAGE,
          { userContextId: 1 }
        );
      },
    },
    async browser => {
      browser.focus();
      const original = gBrowser.selectedTab;
      Assert.equal(original.userContextId, 1, "The source is a container tab");
      const count = gBrowser.tabs.length;
      const url = `${CLIPBOARD_PAGE}?new#fragment`;
      await setClipboard(` \n${url}\t `);
      if (
        Services.clipboard.isClipboardTypeSupported(
          Services.clipboard.kSelectionClipboard
        )
      ) {
        clipboardHelper.copyStringToClipboard(
          "not the system clipboard",
          Services.clipboard.kSelectionClipboard
        );
      }
      const opened = BrowserTestUtils.waitForNewTab(gBrowser, url, true);
      clipboardKeys("3 p");
      const tab = await opened;
      try {
        Assert.equal(gBrowser.selectedTab, tab, "The new tab is selected");
        Assert.equal(
          gBrowser.tabs.length,
          count + 1,
          "Counts open only one tab"
        );
        Assert.equal(tab.userContextId, 1);
        Assert.equal(browser.currentURI.spec, CLIPBOARD_PAGE);
        await TestUtils.waitForCondition(
          () => document.activeElement === tab.linkedBrowser
        );
        Assert.equal(gModalNavigation.mode, "command");

        const currentURL = `${CLIPBOARD_PAGE}?current`;
        await setClipboard(currentURL);
        const loaded = BrowserTestUtils.browserLoaded(
          tab.linkedBrowser,
          false,
          currentURL
        );
        clipboardKeys(" P");
        await loaded;
        Assert.equal(gBrowser.selectedTab, tab, "Uppercase P reuses the tab");
        Assert.equal(gBrowser.tabs.length, count + 1);
        Assert.equal(tab.userContextId, 1);
        Assert.equal(original.linkedBrowser.currentURI.spec, CLIPBOARD_PAGE);
      } finally {
        BrowserTestUtils.removeTab(tab);
      }
    }
  );
});

add_task(async function current_tab_navigation_reuses_pinned_tabs() {
  await BrowserTestUtils.withNewTab(CLIPBOARD_PAGE, async browser => {
    const tab = gBrowser.selectedTab;
    gBrowser.pinTab(tab);
    try {
      browser.focus();
      const count = gBrowser.tabs.length;
      const url = CLIPBOARD_PAGE.replace("example.com", "example.org");
      await setClipboard(url);
      const loaded = BrowserTestUtils.browserLoaded(browser, false, url);
      clipboardKeys(" P");
      await loaded;
      Assert.equal(gBrowser.tabs.length, count);
      Assert.equal(gBrowser.selectedTab, tab);
      Assert.ok(tab.pinned);
    } finally {
      gBrowser.unpinTab(tab);
    }
  });
});

add_task(async function private_navigation_stays_private() {
  const win = await BrowserTestUtils.openNewBrowserWindow({ private: true });
  try {
    await SimpleTest.promiseFocus(win);
    win.gModalNavigation.enterCommand();
    const url = `${CLIPBOARD_PAGE}?private`;
    await setClipboard(url);
    const count = gBrowser.tabs.length;
    const opened = BrowserTestUtils.waitForNewTab(win.gBrowser, url, true);
    clipboardKeys(" p", win);
    const tab = await opened;
    Assert.equal(win.gBrowser.selectedTab, tab);
    Assert.equal(
      tab.linkedBrowser.browsingContext.originAttributes.privateBrowsingId,
      1
    );
    Assert.equal(gBrowser.tabs.length, count, "No non-private tab is opened");
    const currentURL = `${CLIPBOARD_PAGE}?private-current`;
    await setClipboard(currentURL);
    const loaded = BrowserTestUtils.browserLoaded(
      tab.linkedBrowser,
      false,
      currentURL
    );
    clipboardKeys(" P", win);
    await loaded;
    Assert.equal(win.gBrowser.selectedTab, tab);
    Assert.equal(
      tab.linkedBrowser.browsingContext.originAttributes.privateBrowsingId,
      1
    );
  } finally {
    await BrowserTestUtils.closeWindow(win);
    await SimpleTest.promiseFocus(window);
  }
});

add_task(async function invalid_clipboard_leaves_tabs_and_focus_unchanged() {
  await BrowserTestUtils.withNewTab(CLIPBOARD_PAGE, async browser => {
    browser.focus();
    const tab = gBrowser.selectedTab;
    const count = gBrowser.tabs.length;
    for (const text of [
      "plain text",
      "example.com",
      "/relative/path",
      "https://",
      "https://[invalid",
      "   ",
      null,
    ]) {
      if (text === null) {
        Services.clipboard.emptyClipboard(Services.clipboard.kGlobalClipboard);
      } else {
        await setClipboard(text);
      }
      for (const key of ["p", "P"]) {
        clipboardKeys(` ${key}`);
        const panel = await clipboardError();
        Assert.equal(panel.getAttribute("role"), "alert");
        Assert.equal(document.activeElement, browser);
        Assert.equal(gModalNavigation.mode, "command");
        Assert.equal(gBrowser.selectedTab, tab);
        Assert.equal(gBrowser.tabs.length, count);
        Assert.equal(browser.currentURI.spec, CLIPBOARD_PAGE);
        EventUtils.synthesizeKey("KEY_Escape");
        Assert.ok(!panel.matches(":popover-open"));
      }
    }
    const transferable = Cc[
      "@mozilla.org/widget/transferable;1"
    ].createInstance(Ci.nsITransferable);
    transferable.init(null);
    const data = Cc["@mozilla.org/supports-string;1"].createInstance(
      Ci.nsISupportsString
    );
    data.data = "non-text clipboard data";
    transferable.addDataFlavor("application/x-modal-test");
    transferable.setTransferData("application/x-modal-test", data);
    Services.clipboard.setData(
      transferable,
      null,
      Services.clipboard.kGlobalClipboard
    );
    clipboardKeys(" p");
    await clipboardError();
    Assert.equal(gBrowser.tabs.length, count, "Non-text data opens no tab");
    Assert.equal(browser.currentURI.spec, CLIPBOARD_PAGE);
    await setClipboard("javascript:document.body.textContent='executed'");
    for (const key of ["p", "P"]) {
      clipboardKeys(` ${key}`);
      await clipboardError("modal-clipboard-open-error");
      Assert.equal(gBrowser.tabs.length, count);
      Assert.equal(browser.currentURI.spec, CLIPBOARD_PAGE);
      await SpecialPowers.spawn(browser, [], () => {
        Assert.notEqual(content.document.body.textContent, "executed");
      });
    }
  });
});

add_task(async function errors_expire_and_cancel_with_interaction_changes() {
  await BrowserTestUtils.withNewTab(CLIPBOARD_PAGE, async browser => {
    browser.focus();
    await setClipboard("invalid");
    clipboardKeys(" p");
    const panel = await clipboardError();
    await TestUtils.waitForCondition(
      () => !panel.matches(":popover-open"),
      "Errors disappear automatically",
      100,
      60
    );
    clipboardKeys(" p");
    await clipboardError();
    gURLBar.focus();
    Assert.ok(!panel.matches(":popover-open"), "Mode changes dismiss errors");
    gModalNavigation.enterCommand();
    clipboardKeys(" p");
    await clipboardError();
    await SpecialPowers.pushPrefEnv({
      set: [["browser.modal.enabled", false]],
    });
    Assert.ok(!panel.matches(":popover-open"), "Disabling dismisses errors");
    await SpecialPowers.popPrefEnv();

    const pending = gModalNavigation.clipboard.showError(
      "modal-clipboard-invalid-url"
    );
    gModalNavigation.enterCommand();
    await pending;
    Assert.ok(
      !panel.matches(":popover-open"),
      "Late localization is cancelled"
    );
  });
});

add_task(async function clipboard_access_errors_and_editing_isolation() {
  await BrowserTestUtils.withNewTab(CLIPBOARD_PAGE, async browser => {
    browser.focus();
    const sandbox = sinon.createSandbox();
    try {
      const read = sandbox
        .stub(gModalNavigation.clipboard, "readText")
        .throws(new Error("Clipboard unavailable"));
      clipboardKeys(" p");
      await clipboardError("modal-clipboard-read-error");
      Assert.equal(document.activeElement, browser);
      sandbox
        .stub(BrowserUtils, "copyLink")
        .throws(new Error("Clipboard unavailable"));
      clipboardKeys(" y");
      await clipboardError("modal-clipboard-copy-error");
      Assert.equal(document.activeElement, browser);
      read.resetHistory();
      EventUtils.synthesizeKey("i");
      clipboardKeys(" p");
      Assert.ok(read.notCalled, "Insert mode does not read the clipboard");
      EventUtils.synthesizeKey("KEY_Escape");
      gURLBar.focus();
      clipboardKeys(" P");
      Assert.ok(read.notCalled, "Address editing does not read the clipboard");
      EventUtils.synthesizeKey("KEY_Escape");
    } finally {
      sandbox.restore();
      gModalNavigation.enterCommand();
    }
  });
});
