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

async function chooseEngine(name) {
  await UrlbarTestUtils.promiseSearchComplete(window);
  const index = engineRows().findIndex(row => row.engine === name);
  Assert.greaterOrEqual(index, 0, `${name} is available`);
  const query = gURLBar.value;
  gURLBar.view.selectedRowIndex = -1;
  for (let i = 0; i <= index; i++) {
    EventUtils.synthesizeKey("n", { ctrlKey: true });
    Assert.equal(
      gURLBar.value,
      query,
      "Cycling engines preserves the visible query"
    );
  }
  Assert.equal(gURLBar.view.selectedResult.payload.engine, name);
  EventUtils.synthesizeKey("KEY_Enter");
  await TestUtils.waitForCondition(
    () =>
      gURLBar.searchMode?.engineName === name &&
      !gURLBar.searchMode.isPreview &&
      gModalNavigation.urlbar.mode !== "engines"
  );
  Assert.equal(
    gURLBar.value,
    query,
    "Choosing an engine preserves the visible query"
  );
}

add_task(async function default_address_entry_submits_web_searches() {
  const engine = await SearchService.getDefault();
  for (const entry of ["shortcut", "click", "newtab"]) {
    await BrowserTestUtils.withNewTab("about:blank", async browser => {
      let tab;
      try {
        if (entry === "shortcut") {
          await openMode("f", "destinations");
        } else if (entry === "click") {
          browser.focus();
          EventUtils.synthesizeMouseAtCenter(gURLBar.inputField, {});
        } else {
          const opened = BrowserTestUtils.waitForNewTab(gBrowser);
          BrowserCommands.openTab();
          tab = await opened;
          browser = tab.linkedBrowser;
          await TestUtils.waitForCondition(() => gURLBar.focused);
        }
        // A local match must not replace the default search action either.
        for (const query of ["asdf", "nbla"]) {
          await UrlbarTestUtils.promiseAutocompleteResultPopup({
            window,
            value: query,
          });
          const result = gURLBar.view.selectedResult;
          Assert.equal(
            result.payload.engine,
            engine.name,
            `${entry} offers the default search engine`
          );
          Assert.equal(result.payload.query, query);
          if (query === "nbla") {
            Assert.ok(
              (await gURLBar.lastQueryContextPromise).results.some(
                r => r.providerName === "ModalLocal"
              ),
              "Local matches remain available"
            );
          }
          const submitted = BrowserTestUtils.waitForDocLoadAndStopIt(
            engine.getSubmission(query).uri.spec,
            browser
          );
          EventUtils.synthesizeKey("KEY_Enter");
          await submitted;
          await openMode("f", "destinations");
        }
      } finally {
        if (tab) {
          BrowserTestUtils.removeTab(tab);
        }
      }
    });
  }
});

add_task(async function aliases_select_on_the_delimiter_without_query_text() {
  await BrowserTestUtils.withNewTab("about:blank", async () => {
    for (const alias of [
      "@b",
      "@g",
      "@d",
      "@w",
      "@p",
      "@s",
      "@e",
      "@m",
      "@y",
      "@aw",
      "@gh",
      "@so",
      "@npm",
      "@cr",
      "@nix",
      "@ho",
      "@gm",
      "@osm",
    ]) {
      await openMode("f", "destinations");
      EventUtils.sendString(alias);
      await UrlbarTestUtils.promiseSearchComplete(window);
      EventUtils.synthesizeKey(" ");
      const engine = await SearchService.getEngineByAlias(alias);
      await TestUtils.waitForCondition(
        () =>
          gURLBar.searchMode?.engineName === engine.name &&
          !gURLBar.searchMode.isPreview
      );
      Assert.equal(
        gURLBar.value,
        "",
        `${alias} is consumed before typing the query`
      );
      EventUtils.sendString("first character");
      Assert.equal(
        gURLBar.value,
        "first character",
        "Query characters are not lost"
      );
    }
  });
});

add_task(async function engine_names_remain_editable_query_text() {
  await BrowserTestUtils.withNewTab("about:blank", async () => {
    for (const selected of [false, true]) {
      await openMode("f", "destinations");
      if (selected) {
        EventUtils.sendString("@b ");
        const bing = await SearchService.getEngineByAlias("@b");
        await TestUtils.waitForCondition(
          () =>
            gURLBar.searchMode?.engineName === bing.name &&
            !gURLBar.searchMode.isPreview
        );
      }
      EventUtils.sendString("asdf");
      await UrlbarTestUtils.promiseSearchComplete(window);
      const originalEngine = gURLBar.searchMode?.engineName;
      const displayedValues = [];
      let recording = true;
      const record = () => {
        displayedValues.push(gURLBar.inputField.value);
        if (recording) {
          window.requestAnimationFrame(record);
        }
      };
      const nextFrame = () =>
        new Promise(resolve => window.requestAnimationFrame(resolve));
      record();
      try {
        EventUtils.synthesizeKey(" ", { ctrlKey: true });
        await TestUtils.waitForCondition(
          () => gModalNavigation.urlbar.mode === "engines"
        );
        await UrlbarTestUtils.promiseSearchComplete(window);
        await nextFrame();
        Assert.ok(
          displayedValues.every(value => value === "asdf"),
          "The actual input retains the query throughout opening the picker"
        );
      } finally {
        recording = false;
        await nextFrame();
      }
      Assert.ok(BrowserTestUtils.isVisible(gURLBar.inputField));
      Assert.equal(document.activeElement, gURLBar.inputField);
      const engines = engineRows().map(row => row.engine);
      EventUtils.synthesizeKey("a", { ctrlKey: true });
      EventUtils.sendString("Google");
      await UrlbarTestUtils.promiseSearchComplete(window);
      Assert.equal(
        gURLBar.inputField.value,
        "Google",
        "Typing an engine name edits the actual query field"
      );
      Assert.equal(
        gModalNavigation.urlbar.mode,
        "engines",
        "Typing an engine name does not choose it"
      );
      Assert.equal(gURLBar.searchMode?.engineName, originalEngine);
      Assert.deepEqual(
        engineRows().map(row => row.engine),
        engines,
        "Typing an engine name does not filter the choices"
      );
      await chooseEngine((await SearchService.getEngineByAlias("@d")).name);
      Assert.equal(
        gURLBar.inputField.value,
        "Google",
        "Confirming an engine keeps the edited query"
      );
    }
  });
});

add_task(async function engine_picker_from_restricted_sources() {
  await BrowserTestUtils.withNewTab("about:blank", async () => {
    for (const [key, mode] of [
      ["h", "history"],
      ["m", "bookmarks"],
      ["b", "tabs"],
    ]) {
      await openMode(key, mode);
      await UrlbarTestUtils.promiseAutocompleteResultPopup({
        window,
        value: "source query",
      });
      const source = gURLBar.searchMode.source;
      EventUtils.synthesizeKey(" ", { ctrlKey: true });
      await TestUtils.waitForCondition(
        () => gModalNavigation.urlbar.mode === "engines"
      );
      await UrlbarTestUtils.promiseSearchComplete(window);
      Assert.greater(
        engineRows().length,
        0,
        "Local restrictions do not hide engine choices"
      );
      Assert.equal(gURLBar.value, "source query");
      EventUtils.synthesizeKey(" ", { ctrlKey: true });
      await TestUtils.waitForCondition(
        () => gModalNavigation.urlbar.mode === mode
      );
      Assert.equal(
        gURLBar.searchMode.source,
        source,
        "Cancelling restores the local scope"
      );
      EventUtils.synthesizeKey(" ", { ctrlKey: true });
      await TestUtils.waitForCondition(
        () => gModalNavigation.urlbar.mode === "engines"
      );
      await chooseEngine((await SearchService.getEngineByAlias("@b")).name);
    }
  });
});

add_task(
  async function only_selected_suggestions_have_selection_highlighting() {
    await BrowserTestUtils.withNewTab("about:blank", async () => {
      await openMode("f", "destinations");
      await UrlbarTestUtils.promiseAutocompleteResultPopup({
        window,
        value: "nbla",
      });
      for (const engines of [false, true]) {
        if (engines) {
          EventUtils.synthesizeKey(" ", { ctrlKey: true });
          await TestUtils.waitForCondition(
            () => gModalNavigation.urlbar.mode === "engines"
          );
          await UrlbarTestUtils.promiseSearchComplete(window);
        }
        EventUtils.synthesizeMouseAtCenter(gURLBar.inputField, {
          type: "mousemove",
        });
        gURLBar.view.selectedRowIndex = 0;
        const row = UrlbarTestUtils.getRowAt(window, 1);
        const unselectedBackground = getComputedStyle(row).backgroundColor;
        EventUtils.synthesizeMouseAtCenter(row, { type: "mousemove" });
        Assert.ok(
          row.matches(":hover"),
          "The pointer is over the unselected suggestion"
        );
        Assert.ok(!row.hasAttribute("selected"));
        Assert.notEqual(gURLBar.view.selectedResult, row.result);
        Assert.equal(
          getComputedStyle(row).backgroundColor,
          unselectedBackground,
          "Hover does not paint an unselected suggestion as selected"
        );
        EventUtils.synthesizeKey("n", { ctrlKey: true });
        Assert.equal(gURLBar.view.selectedResult, row.result);
        Assert.ok(row.hasAttribute("selected"));
        Assert.notEqual(
          getComputedStyle(row).backgroundColor,
          unselectedBackground,
          "Keyboard selection has a visible highlight"
        );
        EventUtils.synthesizeKey("p", { ctrlKey: true });
        Assert.ok(!row.hasAttribute("selected"));
        Assert.equal(
          getComputedStyle(row).backgroundColor,
          unselectedBackground,
          "Moving selection clears the old highlight even under the pointer"
        );
      }
    });
  }
);

add_task(async function completion_in_default_and_explicit_modes() {
  const { PlacesTestUtils } = ChromeUtils.importESModule(
    "resource://testing-common/PlacesTestUtils.sys.mjs"
  );
  const url = "https://modal-autofill.example/";
  const prefix = "modal-auto";
  await SpecialPowers.pushPrefEnv({
    set: [["browser.urlbar.autoFill", true]],
  });
  const bookmark = await PlacesUtils.bookmarks.insert({
    parentGuid: PlacesUtils.bookmarks.unfiledGuid,
    url,
  });
  const detailURL = `${url}details`;
  const detailBookmark = await PlacesUtils.bookmarks.insert({
    parentGuid: PlacesUtils.bookmarks.unfiledGuid,
    url: detailURL,
  });
  await PlacesTestUtils.addVisits(detailURL);
  await PlacesTestUtils.addVisits(
    Array.from({ length: 10 }, () => ({
      uri: url,
      transition: PlacesUtils.history.TRANSITIONS.TYPED,
    }))
  );
  await PlacesTestUtils.promiseAsyncUpdates();
  await Cc["@mozilla.org/places/frecency-recalculator;1"]
    .getService(Ci.nsIObserver)
    .wrappedJSObject.recalculateAnyOutdatedFrecencies();
  try {
    await BrowserTestUtils.withNewTab(URL, async browser => {
      for (const [key, mode] of [
        ["f", "destinations"],
        ["h", "history"],
        ["m", "bookmarks"],
      ]) {
        await openMode(key, mode);
        Assert.equal(
          gURLBar.value,
          "",
          "Opening a picker leaves an empty input"
        );
        await UrlbarTestUtils.promiseAutocompleteResultPopup({
          window,
          value: prefix,
        });
        const result = gURLBar.view.getResultAtIndex(0);
        Assert.ok(result.autofill, `${mode} offers native inline completion`);
        Assert.equal(result.payload.url, url);
        Assert.equal(gURLBar.value, "modal-autofill.example/");
        Assert.equal(gURLBar.selectionStart, prefix.length);
        Assert.equal(gURLBar.selectionEnd, gURLBar.value.length);
        Assert.ok(
          (await gURLBar.lastQueryContextPromise).results.some(
            item =>
              item.providerName === "ModalLocal" &&
              item.payload.url === detailURL
          ),
          "Fuzzy results remain available alongside the first autofill result"
        );
      }

      await openMode("f", "destinations");
      EventUtils.synthesizeKey("KEY_Escape");
      await TestUtils.waitForCondition(
        () => document.activeElement === browser
      );
      const value = gURLBar.value;
      EventUtils.synthesizeMouseAtCenter(gURLBar.inputField, {});
      Assert.equal(
        gURLBar.value,
        value,
        "Clicking preserves the existing text"
      );
      Assert.equal(gModalNavigation.urlbar.mode, "destinations");
      await UrlbarTestUtils.promiseAutocompleteResultPopup({
        window,
        value: prefix,
      });
      Assert.ok(
        gURLBar.view.getResultAtIndex(0).autofill,
        "Click entry also autofills"
      );

      EventUtils.synthesizeKey("KEY_Escape");
      await TestUtils.waitForCondition(
        () => document.activeElement === browser
      );
      await openMode("e", "destinations");
      await UrlbarTestUtils.promiseAutocompleteResultPopup({
        window,
        value: prefix,
      });
      Assert.ok(
        gURLBar.view.getResultAtIndex(0).autofill,
        "Editing also autofills"
      );

      await openMode("h", "history");
      EventUtils.synthesizeMouseAtCenter(gURLBar.inputField, {});
      Assert.equal(
        gModalNavigation.urlbar.mode,
        "history",
        "Clicking an active picker preserves its scope"
      );

      await openMode("f", "destinations");
      EventUtils.sendString(prefix);
      await UrlbarTestUtils.promiseSearchComplete(window);
      Assert.equal(
        gURLBar.value,
        "modal-autofill.example/",
        "Typing after Space f autofills"
      );
      const loaded = BrowserTestUtils.waitForDocLoadAndStopIt(url, browser);
      EventUtils.synthesizeKey("KEY_Enter");
      await loaded;
    });

    const opened = BrowserTestUtils.waitForNewTab(gBrowser);
    BrowserCommands.openTab();
    const tab = await opened;
    try {
      await TestUtils.waitForCondition(() => gURLBar.focused);
      Assert.equal(gModalNavigation.urlbar.mode, "destinations");
      Assert.equal(gURLBar.value, "");
      await UrlbarTestUtils.promiseAutocompleteResultPopup({
        window,
        value: prefix,
      });
      Assert.ok(
        gURLBar.view.getResultAtIndex(0).autofill,
        "New-tab entry also autofills"
      );
    } finally {
      BrowserTestUtils.removeTab(tab);
    }
  } finally {
    await PlacesUtils.bookmarks.remove(bookmark.guid);
    await PlacesUtils.bookmarks.remove(detailBookmark.guid);
    await PlacesUtils.history.remove([url, detailURL]);
    await SpecialPowers.popPrefEnv();
  }
});

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
    await openMode("h", "history");
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
    "@gm": "maps.google.com",
    "@osm": "openstreetmap.org",
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
    Assert.equal(
      gURLBar.value,
      "astrophysics",
      "Opening the engine picker preserves the query"
    );
    await chooseEngine("Perplexity");
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
    Assert.equal(
      gURLBar.value,
      "astrophysics",
      "Reopening the engine picker keeps the query"
    );
    Assert.equal(
      gURLBar.searchMode.engineName,
      "Perplexity",
      "Opening the picker does not clear the selected engine"
    );
    EventUtils.synthesizeKey("KEY_Escape");
    await TestUtils.waitForCondition(() => gURLBar.value === "astrophysics");
    Assert.equal(
      gURLBar.searchMode.engineName,
      "Perplexity",
      "Escape restores the previously selected engine"
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

function engineRows() {
  return Array.from(
    { length: UrlbarTestUtils.getResultCount(window) },
    (_, index) => {
      const row = UrlbarTestUtils.getRowAt(window, index);
      const result = row.result;
      Assert.equal(
        result.providerName,
        "ModalLocal",
        "One provider supplies both engine pickers"
      );
      Assert.ok(
        result.hideRowLabel && !row.hasAttribute("label"),
        "Engine choices have no suggestions heading"
      );
      Assert.ok(result.payload.icon, "Engine choices have an engine icon");
      return {
        engine: result.payload.engine,
        aliases: result.payload.keywords,
        icon: result.payload.icon,
      };
    }
  );
}

add_task(async function engine_picker_preserves_query_and_submits_search() {
  const original = await SearchService.getDefault();
  const engine = await SearchService.addUserEngine({
    name: "Cancellation Search",
    url: `${URL}?search={searchTerms}`,
  });
  const query = "after cancellation";
  const destination = engine.getSubmission(query).uri.spec;
  try {
    await SearchService.setDefault(engine, SearchService.CHANGE_REASON.UNKNOWN);
    await BrowserTestUtils.withNewTab("about:blank", async browser => {
      await openMode("f", "destinations");
      await UrlbarTestUtils.promiseAutocompleteResultPopup({
        window,
        value: query,
      });
      EventUtils.synthesizeKey(" ", { ctrlKey: true });
      await TestUtils.waitForCondition(
        () => gModalNavigation.urlbar.mode === "engines"
      );
      Assert.equal(gURLBar.value, query);
      await chooseEngine((await SearchService.getEngineByAlias("@b")).name);
      EventUtils.synthesizeKey(" ", { ctrlKey: true });
      await TestUtils.waitForCondition(
        () => gModalNavigation.urlbar.mode === "engines"
      );
      await chooseEngine(engine.name);
      const loaded = BrowserTestUtils.browserLoaded(
        browser,
        false,
        destination
      );
      EventUtils.synthesizeKey("KEY_Enter");
      await loaded;
      Assert.equal(
        browser.currentURI.spec,
        destination,
        "Enter submits the preserved query after changing engines"
      );
    });
  } finally {
    await SearchService.setDefault(
      original,
      SearchService.CHANGE_REASON.UNKNOWN
    );
    await SearchService.removeEngine(engine);
    await PlacesUtils.history.remove(destination);
  }
});

add_task(async function aliases_complete_inside_the_explicit_engine_picker() {
  const engine = await SearchService.getEngineByAlias("@d");
  for (const pasted of [false, true]) {
    await BrowserTestUtils.withNewTab(URL, async browser => {
      browser.focus();
      await openMode("e", "destinations");
      EventUtils.synthesizeKey(" ", { ctrlKey: true });
      await TestUtils.waitForCondition(
        () => gModalNavigation.urlbar.mode === "engines"
      );
      gURLBar.select();
      const query = pasted ? "pasted query" : "typed query";
      if (pasted) {
        gURLBar.value = `@d ${query}`;
        UrlbarTestUtils.fireInputEvent(window);
      } else {
        EventUtils.sendString("@d ");
      }
      await TestUtils.waitForCondition(
        () =>
          gURLBar.searchMode?.engineName === engine.name &&
          !gURLBar.searchMode.isPreview
      );
      Assert.equal(
        gModalNavigation.urlbar.mode,
        null,
        "Completing the alias leaves the engine filter"
      );
      Assert.equal(
        gURLBar.value,
        pasted ? query : "",
        "The alias becomes a query, not the previous page address"
      );
      Assert.equal(document.activeElement, gURLBar.inputField);
      if (!pasted) {
        EventUtils.sendString(query);
      }
      await UrlbarTestUtils.promiseSearchComplete(window);
      const submitted = BrowserTestUtils.waitForDocLoadAndStopIt(
        engine.getSubmission(query).uri.spec,
        browser
      );
      EventUtils.synthesizeKey("KEY_Enter");
      await submitted;
      Assert.ok(
        true,
        "Enter submits the query to DuckDuckGo after completing a picker alias"
      );
    });
  }
});

add_task(async function engine_cancellation_does_not_overwrite_new_input() {
  await BrowserTestUtils.withNewTab("about:blank", async () => {
    await openMode("f", "destinations");
    await UrlbarTestUtils.promiseAutocompleteResultPopup({
      window,
      value: "old query",
    });
    EventUtils.synthesizeKey(" ", { ctrlKey: true });
    await TestUtils.waitForCondition(
      () => gModalNavigation.urlbar.mode === "engines"
    );
    await UrlbarTestUtils.promiseSearchComplete(window);
    const original = gURLBar.setSearchMode;
    const deferred = Promise.withResolvers();
    let block = true;
    let waiting = false;
    gURLBar.setSearchMode = async function (...args) {
      const hold = block && args[0] === null;
      if (hold) {
        block = false;
      }
      const result = await original.apply(this, args);
      if (hold) {
        waiting = true;
        await deferred.promise;
      }
      return result;
    };
    let cancelling;
    try {
      cancelling = gModalNavigation.urlbar.cancelEngines();
      await TestUtils.waitForCondition(() => waiting);
      await UrlbarTestUtils.promiseAutocompleteResultPopup({
        window,
        value: "@d ",
      });
      const engine = await SearchService.getEngineByAlias("@d");
      await TestUtils.waitForCondition(
        () => gURLBar.searchMode?.engineName === engine.name
      );
      deferred.resolve();
      await cancelling;
      Assert.equal(
        gURLBar.value,
        "",
        "A delayed cancellation does not restore the obsolete query"
      );
      Assert.equal(
        gURLBar.searchMode.engineName,
        engine.name,
        "The newly selected engine remains active"
      );
    } finally {
      deferred.resolve();
      gURLBar.setSearchMode = original;
      await cancelling;
    }
  });
});

add_task(async function at_and_control_space_share_engine_choices() {
  await BrowserTestUtils.withNewTab("about:blank", async browser => {
    gURLBar.focus();
    await UrlbarTestUtils.promiseAutocompleteResultPopup({
      window,
      value: "@",
    });
    const aliases = engineRows();
    for (const alias of [
      "@g",
      "@s",
      "@e",
      "@m",
      "@y",
      "@aw",
      "@gh",
      "@so",
      "@npm",
      "@cr",
      "@nix",
      "@ho",
      "@gm",
      "@osm",
    ]) {
      const engine = await SearchService.getEngineByAlias(alias);
      Assert.ok(
        aliases.some(
          row =>
            row.engine === engine.name &&
            row.aliases.split(", ").includes(alias)
        ),
        `${alias} is available in the shared picker`
      );
    }
    const google = await SearchService.getEngineByAlias("@g");
    const googleRow = UrlbarTestUtils.getRowAt(
      window,
      aliases.findIndex(row => row.engine === google.name)
    );
    await TestUtils.waitForCondition(
      () =>
        googleRow.querySelector(".urlbarView-title").textContent.includes("@g"),
      "Aliases are shown in the native result title"
    );
    const previousQuery = gURLBar.lastQueryContextPromise;
    EventUtils.synthesizeKey(" ", { ctrlKey: true });
    await TestUtils.waitForCondition(
      () => gURLBar.lastQueryContextPromise !== previousQuery
    );
    await UrlbarTestUtils.promiseSearchComplete(window);
    Assert.equal(
      gURLBar.value,
      "@",
      "Ctrl-Space does not replace an active alias picker"
    );
    Assert.deepEqual(engineRows(), aliases);
    await UrlbarTestUtils.promiseAutocompleteResultPopup({
      window,
      value: "@ ",
    });
    Assert.deepEqual(
      engineRows(),
      aliases,
      "Whitespace after the bare @ marker does not change picker implementations"
    );
    EventUtils.synthesizeKey("KEY_Escape");
    await TestUtils.waitForCondition(() => document.activeElement === browser);

    await openMode("f", "destinations");
    await UrlbarTestUtils.promiseAutocompleteResultPopup({
      window,
      value: "preserved query",
    });
    EventUtils.synthesizeKey(" ", { ctrlKey: true });
    await TestUtils.waitForCondition(
      () => gModalNavigation.urlbar.mode === "engines"
    );
    await UrlbarTestUtils.promiseSearchComplete(window);
    Assert.deepEqual(
      engineRows(),
      aliases,
      "Ctrl-Space and @ show the same engines, aliases, and icons"
    );
    EventUtils.synthesizeKey("KEY_Escape");
    await TestUtils.waitForCondition(() => document.activeElement === browser);
    Assert.equal(gURLBar.value, "preserved query");
  });
});

add_task(async function alias_picker_selects_without_searching_the_at_sign() {
  await BrowserTestUtils.withNewTab("about:blank", async browser => {
    for (const alias of ["@s", "@e"]) {
      await openMode("f", "destinations");
      await UrlbarTestUtils.promiseAutocompleteResultPopup({
        window,
        value: alias,
      });
      const engine = await SearchService.getEngineByAlias(alias);
      Assert.equal(
        gURLBar.view.getResultAtIndex(0).payload.engine,
        engine.name
      );
      if (alias === "@e") {
        EventUtils.synthesizeMouseAtCenter(
          UrlbarTestUtils.getRowAt(window, 0),
          {}
        );
      } else {
        EventUtils.synthesizeKey("KEY_Enter");
      }
      await TestUtils.waitForCondition(
        () => gURLBar.searchMode?.engineName === engine.name
      );
      Assert.equal(
        gURLBar.value,
        "",
        "Selecting an alias starts an empty engine query"
      );
      Assert.equal(
        browser.currentURI.spec,
        "about:blank",
        "Engine selection does not navigate"
      );
      EventUtils.synthesizeKey("KEY_Escape");
      await TestUtils.waitForCondition(
        () => document.activeElement === browser
      );
    }
  });
});

add_task(async function picker_can_select_an_engine_without_an_alias() {
  const custom = await SearchService.addUserEngine({
    name: "Nebula Unaliased",
    url: "https://example.com/search?q={searchTerms}",
  });
  try {
    await BrowserTestUtils.withNewTab("about:blank", async () => {
      await openMode("f", "destinations");
      await UrlbarTestUtils.promiseAutocompleteResultPopup({
        window,
        value: "keep this query",
      });
      EventUtils.synthesizeKey(" ", { ctrlKey: true });
      await TestUtils.waitForCondition(
        () => gModalNavigation.urlbar.mode === "engines"
      );
      await UrlbarTestUtils.promiseSearchComplete(window);
      const index = engineRows().findIndex(row => row.engine === custom.name);
      Assert.greaterOrEqual(index, 0);
      const row = UrlbarTestUtils.getRowAt(window, index);
      row.scrollIntoView({ block: "nearest", behavior: "instant" });
      EventUtils.synthesizeMouseAtCenter(row, {});
      await TestUtils.waitForCondition(
        () => gURLBar.searchMode?.engineName === custom.name
      );
      Assert.equal(gURLBar.value, "keep this query");
    });
  } finally {
    await SearchService.removeEngine(custom);
  }
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
      Assert.equal(gURLBar.value, "preserved query");
      Assert.equal(gURLBar.searchMode.engineName, defaultEngine.name);
      EventUtils.sendString(" edited");
      await UrlbarTestUtils.promiseSearchComplete(window);
      EventUtils.synthesizeKey("n", { ctrlKey: true });
      EventUtils.synthesizeKey(" ", { ctrlKey: true });
      await TestUtils.waitForCondition(
        () => gModalNavigation.urlbar.mode !== "engines"
      );
      Assert.equal(
        gURLBar.searchMode.engineName,
        defaultEngine.name,
        "Cancelling a preview restores the original engine"
      );
      Assert.equal(
        gURLBar.value,
        "preserved query edited",
        "Cancelling engine selection keeps query edits"
      );
      EventUtils.synthesizeKey(" ", { ctrlKey: true });
      await TestUtils.waitForCondition(
        () => gModalNavigation.urlbar.mode === "engines"
      );
      await chooseEngine(custom.name);
      await TestUtils.waitForCondition(
        () =>
          gURLBar.searchMode?.engineName === custom.name &&
          gURLBar.value === "preserved query edited"
      );
      Assert.equal(
        new URLSearchParams(custom.getSubmission(gURLBar.value).uri.query).get(
          "q"
        ),
        "preserved query edited"
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
        "Resuming preserves destinations mode"
      );
      EventUtils.sendString(" armp");
      await UrlbarTestUtils.promiseSearchComplete(window);
      Assert.ok(
        (await gURLBar.lastQueryContextPromise).results.some(
          result => result.payload.url === historyURL
        )
      );
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
