/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global gModalNavigation */

const { UrlbarTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/UrlbarTestUtils.sys.mjs"
);
const { SearchService } = ChromeUtils.importESModule(
  "moz-src:///toolkit/components/search/SearchService.sys.mjs"
);
UrlbarTestUtils.init(this);
const URL =
  "https://example.com/browser/browser/components/modal/tests/browser/page.html";
const historyURL = `${URL}?nebula-history`;
const bookmarkURL = `${URL}?nebula-bookmark`;

add_setup(async function setup() {
  await gModalNavigation.urlbar.ready;
  await SpecialPowers.pushPrefEnv({
    set: [["browser.search.suggest.enabled", false]],
  });
  await PlacesUtils.history.insert({
    url: historyURL,
    title: "Nebula Array Mapping",
    visits: [{ transition: PlacesUtils.history.TRANSITIONS.LINK }],
  });
  const bookmark = await PlacesUtils.bookmarks.insert({
    parentGuid: PlacesUtils.bookmarks.unfiledGuid,
    url: bookmarkURL,
    title: "Nebula bookmark planets",
  });
  PlacesUtils.tagging.tagURI(Services.io.newURI(bookmarkURL), [
    "constellations",
  ]);
  registerCleanupFunction(async () => {
    PlacesUtils.tagging.untagURI(Services.io.newURI(bookmarkURL), [
      "constellations",
    ]);
    await PlacesUtils.bookmarks.remove(bookmark.guid);
    await PlacesUtils.history.remove([historyURL, bookmarkURL]);
    gURLBar.view.close();
    gModalNavigation.urlbar.reset();
  });
});

async function openMode(key, mode) {
  gURLBar.view.close();
  gBrowser.selectedBrowser.focus();
  gModalNavigation.setMode("command");
  EventUtils.synthesizeKey(" ");
  EventUtils.synthesizeKey(key);
  await TestUtils.waitForCondition(
    () =>
      gModalNavigation.urlbar.mode === mode &&
      document.activeElement === gURLBar.inputField
  );
}

add_task(async function fuzzy_history_and_bookmarks() {
  await BrowserTestUtils.withNewTab("about:blank", async () => {
    await openMode("h", "history");
    await UrlbarTestUtils.promiseAutocompleteResultPopup({
      window,
      value: "nbla armp",
    });
    const history = gURLBar.view.getResultAtIndex(0);
    Assert.equal(history.providerName, "ModalLocal");
    Assert.equal(
      history.payload.url,
      historyURL,
      "Noncontiguous history text matches"
    );
    await openMode("m", "bookmarks");
    await UrlbarTestUtils.promiseAutocompleteResultPopup({
      window,
      value: "cnstll",
    });
    Assert.equal(
      gURLBar.view.getResultAtIndex(0).payload.url,
      bookmarkURL,
      "Bookmark tags participate in fuzzy matching"
    );
    const loaded = BrowserTestUtils.browserLoaded(
      gBrowser.selectedBrowser,
      false,
      bookmarkURL
    );
    EventUtils.synthesizeKey("KEY_Enter");
    await loaded;
    Assert.equal(
      gBrowser.selectedBrowser.currentURI.spec,
      bookmarkURL,
      "Enter navigates using Firefox's URL bar"
    );
  });
});

add_task(async function results_without_arrow_keys() {
  await BrowserTestUtils.withNewTab("about:blank", async () => {
    await openMode("f", "destinations");
    await UrlbarTestUtils.promiseAutocompleteResultPopup({
      window,
      value: "nbla",
    });
    Assert.greaterOrEqual(UrlbarTestUtils.getResultCount(window), 2);
    gURLBar.view.selectedRowIndex = 0;
    const first = gURLBar.view.selectedResult.payload.url;
    EventUtils.synthesizeKey("n", { ctrlKey: true });
    Assert.notEqual(
      gURLBar.view.selectedResult.payload.url,
      first,
      "Ctrl-n selects next result"
    );
    EventUtils.synthesizeKey("p", { ctrlKey: true });
    Assert.equal(
      gURLBar.view.selectedResult.payload.url,
      first,
      "Ctrl-p selects previous result"
    );
    gURLBar.search("zzzznohistorymatchzzzz");
    await gURLBar.lastQueryContextPromise;
    const before = gBrowser.selectedBrowser.currentURI.spec;
    EventUtils.synthesizeKey("KEY_Enter");
    await TestUtils.waitForTick();
    Assert.equal(
      gBrowser.selectedBrowser.currentURI.spec,
      before,
      "An empty local picker does not silently search the web"
    );
  });
});

add_task(async function aliases_and_engine_picker() {
  const aliases = {
    "@g": "google",
    "@d": "duckduckgo",
    "@w": "wikipedia",
    "@p": "perplexity",
    "@s": "startpage",
    "@e": "ecosia",
    "@b": "bing",
  };
  for (const [alias, domain] of Object.entries(aliases)) {
    const engine = await SearchService.getEngineByAlias(alias);
    Assert.ok(engine, `${alias} is configured`);
    Assert.ok(
      engine.getSubmission("sample query").uri.host.includes(domain),
      `${alias} uses ${domain}`
    );
  }
  await BrowserTestUtils.withNewTab("about:blank", async () => {
    await openMode("f", "destinations");
    await UrlbarTestUtils.promiseAutocompleteResultPopup({
      window,
      value: "@g stars",
    });
    const engine = await SearchService.getEngineByAlias("@g");
    Assert.equal(
      gURLBar.searchMode?.engineName ||
        gURLBar.view.getResultAtIndex(0).payload.engine,
      engine.name,
      "Native engine alias selects Google"
    );
    await gURLBar.setSearchMode(null, gBrowser.selectedBrowser);
    await UrlbarTestUtils.promiseAutocompleteResultPopup({
      window,
      value: "astrophysics",
    });
    EventUtils.synthesizeKey(" ", { ctrlKey: true });
    await TestUtils.waitForCondition(
      () => gModalNavigation.urlbar.mode === "engines"
    );
    await UrlbarTestUtils.promiseAutocompleteResultPopup({
      window,
      value: "Perplexity",
    });
    EventUtils.synthesizeKey("KEY_Enter");
    await TestUtils.waitForCondition(
      () =>
        gURLBar.searchMode?.engineName === "Perplexity" &&
        gURLBar.value === "astrophysics"
    );
    Assert.equal(
      gURLBar.value,
      "astrophysics",
      "Switching engines preserves the query"
    );
    EventUtils.synthesizeKey(" ", { ctrlKey: true });
    await TestUtils.waitForCondition(
      () => gModalNavigation.urlbar.mode === "engines"
    );
    EventUtils.synthesizeKey("KEY_Escape");
    await TestUtils.waitForCondition(() => gURLBar.value === "astrophysics");
    Assert.equal(
      gURLBar.searchMode.engineName,
      "Perplexity",
      "Escape restores the previous engine"
    );
    await TestUtils.waitForCondition(
      () => document.activeElement === gBrowser.selectedBrowser
    );
    Assert.equal(
      gModalNavigation.mode,
      "command",
      "One Escape exits the engine picker and address mode"
    );
    Assert.ok(!gURLBar.view.isOpen);
    Assert.equal(
      gURLBar.untrimmedValue,
      "astrophysics",
      "Restoring the query also restores native URL-bar metadata"
    );
  });
});

add_task(async function fuzzy_tab_switching() {
  const target = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    `${URL}?nebula-tab`
  );
  try {
    await SpecialPowers.spawn(target.linkedBrowser, [], () => {
      content.document.title = "Quasar Research Notebook";
    });
    await TestUtils.waitForCondition(
      () => target.label === "Quasar Research Notebook"
    );
    await BrowserTestUtils.withNewTab("about:blank", async () => {
      await openMode("b", "tabs");
      await UrlbarTestUtils.promiseAutocompleteResultPopup({
        window,
        value: "qsr ntbk",
      });
      Assert.equal(
        gURLBar.view.getResultAtIndex(0).payload.url,
        target.linkedBrowser.currentURI.spec
      );
      EventUtils.synthesizeKey("KEY_Enter");
      await TestUtils.waitForCondition(() => gBrowser.selectedTab === target);
    });
  } finally {
    BrowserTestUtils.removeTab(target);
  }
});

add_task(async function custom_engine_and_web_mode() {
  const custom = await SearchService.addUserEngine({
    name: "Nebula Custom",
    url: "https://example.com/search?q={searchTerms}",
    alias: "@nebula",
  });
  try {
    await BrowserTestUtils.withNewTab("about:blank", async () => {
      await openMode("s", null);
      const defaultEngine = await SearchService.getDefault();
      await TestUtils.waitForCondition(
        () => gURLBar.searchMode?.engineName === defaultEngine.name
      );
      await UrlbarTestUtils.promiseAutocompleteResultPopup({
        window,
        value: "preserved query",
      });
      EventUtils.synthesizeKey(" ", { ctrlKey: true });
      await TestUtils.waitForCondition(
        () => gModalNavigation.urlbar.mode === "engines"
      );
      await UrlbarTestUtils.promiseAutocompleteResultPopup({
        window,
        value: "@nebula",
      });
      Assert.equal(
        gURLBar.view.getResultAtIndex(0).payload.engine,
        custom.name,
        "Picker reflects custom engines from Firefox settings"
      );
      EventUtils.synthesizeKey("KEY_Enter");
      await TestUtils.waitForCondition(
        () =>
          gURLBar.searchMode?.engineName === custom.name &&
          gURLBar.value === "preserved query"
      );
      Assert.equal(
        new URLSearchParams(custom.getSubmission(gURLBar.value).uri.query).get(
          "q"
        ),
        "preserved query"
      );
    });
  } finally {
    await SearchService.removeEngine(custom);
  }
});

add_task(async function alt_enter_opens_destination_in_new_tab() {
  await BrowserTestUtils.withNewTab(URL, async () => {
    await openMode("m", "bookmarks");
    await UrlbarTestUtils.promiseAutocompleteResultPopup({
      window,
      value: "cnstll",
    });
    const opened = BrowserTestUtils.waitForNewTab(gBrowser, bookmarkURL);
    EventUtils.synthesizeKey("KEY_Enter", { altKey: true });
    const tab = await opened;
    Assert.equal(tab.linkedBrowser.currentURI.spec, bookmarkURL);
    BrowserTestUtils.removeTab(tab);
  });
});

add_task(async function private_tabs_are_not_exposed() {
  const privateWindow = await BrowserTestUtils.openNewBrowserWindow({
    private: true,
  });
  try {
    await BrowserTestUtils.openNewForegroundTab(
      privateWindow.gBrowser,
      `${URL}?private-only-needle`
    );
    await SimpleTest.promiseFocus(window);
    await BrowserTestUtils.withNewTab("about:blank", async () => {
      await openMode("b", "tabs");
      await UrlbarTestUtils.promiseAutocompleteResultPopup({
        window,
        value: "private-only-needle",
      });
      Assert.equal(
        UrlbarTestUtils.getResultCount(window),
        0,
        "A normal window cannot see private tab results"
      );
    });
  } finally {
    await BrowserTestUtils.closeWindow(privateWindow);
    await SimpleTest.promiseFocus(window);
  }
});

add_task(async function edit_existing_address_and_resume_query() {
  await BrowserTestUtils.withNewTab(
    `${URL}?existing-address`,
    async browser => {
      browser.focus();
      const originalURI = browser.currentURI.spec;
      const originalText = gURLBar.untrimmedValue;
      EventUtils.synthesizeKey(" ");
      EventUtils.synthesizeKey("e");
      await TestUtils.waitForCondition(
        () => document.activeElement === gURLBar.inputField
      );
      Assert.equal(gModalNavigation.mode, "address");
      Assert.equal(
        gURLBar.untrimmedValue,
        originalText,
        "Space e preserves the existing address"
      );
      Assert.equal(
        gURLBar.value,
        originalText,
        "The full address is available for editing"
      );
      Assert.equal(
        gURLBar.selectionStart,
        gURLBar.value.length,
        "Caret starts at the end"
      );
      Assert.equal(gURLBar.selectionEnd, gURLBar.value.length);
      const text = gURLBar.value;
      EventUtils.sendString("#edited");
      Assert.equal(
        gURLBar.value,
        `${text}#edited`,
        "Typing edits rather than replaces the address"
      );
      EventUtils.synthesizeKey("KEY_Escape");
      await TestUtils.waitForCondition(
        () =>
          document.activeElement === browser &&
          gModalNavigation.mode === "command"
      );
      Assert.ok(!gURLBar.view.isOpen, "One Escape also dismisses suggestions");
      Assert.equal(
        browser.currentURI.spec,
        originalURI,
        "Escape never navigates"
      );
      const edited = gURLBar.value;
      EventUtils.synthesizeKey(" ");
      EventUtils.synthesizeKey("e");
      await TestUtils.waitForCondition(
        () => document.activeElement === gURLBar.inputField
      );
      Assert.equal(
        gURLBar.value,
        edited,
        "Space e can resume unfinished address text"
      );
      EventUtils.synthesizeKey("KEY_Escape");
      await TestUtils.waitForCondition(
        () => document.activeElement === browser
      );

      await openMode("f", "destinations");
      await UrlbarTestUtils.promiseAutocompleteResultPopup({
        window,
        value: "nbla",
      });
      EventUtils.synthesizeKey("KEY_Escape");
      await TestUtils.waitForCondition(
        () => document.activeElement === browser
      );
      Assert.ok(!gURLBar.view.isOpen);
      EventUtils.synthesizeKey(" ");
      EventUtils.synthesizeKey("e");
      await TestUtils.waitForCondition(
        () => document.activeElement === gURLBar.inputField
      );
      Assert.equal(gURLBar.value, "nbla", "The unfinished query is preserved");
      Assert.equal(
        gModalNavigation.urlbar.mode,
        "destinations",
        "Resuming preserves local query semantics"
      );
      EventUtils.sendString(" armp");
      await UrlbarTestUtils.promiseSearchComplete(window);
      Assert.equal(gURLBar.view.getResultAtIndex(0).payload.url, historyURL);
      EventUtils.synthesizeKey("KEY_Escape");
      await TestUtils.waitForCondition(
        () => document.activeElement === browser
      );
    }
  );
});

add_task(async function address_mode_is_not_insert_mode() {
  await BrowserTestUtils.withNewTab(URL, async browser => {
    browser.focus();
    const toolbar = document.getElementById("nav-bar");
    const normal = getComputedStyle(toolbar).backgroundColor;
    await BrowserTestUtils.synthesizeMouseAtCenter("#editor", {}, browser);
    await TestUtils.waitForCondition(() => gModalNavigation.mode === "insert");
    Assert.notEqual(
      getComputedStyle(toolbar).backgroundColor,
      normal,
      "Page insert mode is green"
    );
    gURLBar.focus();
    await TestUtils.waitForCondition(() => gModalNavigation.mode === "address");
    Assert.equal(
      getComputedStyle(toolbar).backgroundColor,
      normal,
      "Address mode restores the normal toolbar"
    );
    Assert.ok(
      gURLBar.focused,
      "Native address-bar focus styling remains active"
    );
    await UrlbarTestUtils.promiseAutocompleteResultPopup({
      window,
      value: "nbla",
    });
    EventUtils.synthesizeKey("KEY_Escape");
    await TestUtils.waitForCondition(
      () =>
        document.activeElement === browser &&
        gModalNavigation.mode === "command"
    );
    Assert.ok(
      !gURLBar.view.isOpen,
      "One Escape closes the results and leaves address mode"
    );
    Assert.equal(getComputedStyle(toolbar).backgroundColor, normal);
    await BrowserTestUtils.synthesizeMouseAtCenter("#editor", {}, browser);
    await TestUtils.waitForCondition(() => gModalNavigation.mode === "insert");
    Assert.notEqual(
      getComputedStyle(toolbar).backgroundColor,
      normal,
      "Returning to page editing still enters Insert mode"
    );
  });
});

add_task(async function escape_cancels_pending_address_open() {
  await BrowserTestUtils.withNewTab(URL, async browser => {
    browser.focus();
    const adapter = gModalNavigation.urlbar;
    const ready = adapter.ready;
    let release;
    adapter.ready = new Promise(resolve => {
      release = resolve;
    });
    try {
      EventUtils.synthesizeKey(" ");
      EventUtils.synthesizeKey("s");
      await TestUtils.waitForCondition(
        () => document.activeElement === gURLBar.inputField
      );
      Assert.equal(gModalNavigation.mode, "address");
      EventUtils.synthesizeKey("KEY_Escape");
      await TestUtils.waitForCondition(
        () => document.activeElement === browser
      );
      release();
      await TestUtils.waitForTick();
      Assert.equal(gModalNavigation.mode, "command");
      Assert.ok(
        !gURLBar.view.isOpen,
        "A late initialization cannot reopen the address popup"
      );
      Assert.equal(
        document.activeElement,
        browser,
        "A late initialization cannot take focus back"
      );
      Assert.equal(
        gURLBar.untrimmedValue,
        browser.currentURI.spec,
        "An empty cancelled search restores the current address"
      );
    } finally {
      release();
      adapter.ready = ready;
    }
  });
});
