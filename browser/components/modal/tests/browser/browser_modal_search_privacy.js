/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global gModalNavigation */

const { SearchTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/SearchTestUtils.sys.mjs"
);
const { UrlbarTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/UrlbarTestUtils.sys.mjs"
);
const { SearchService } = ChromeUtils.importESModule(
  "moz-src:///toolkit/components/search/SearchService.sys.mjs"
);
SearchTestUtils.init(this);
UrlbarTestUtils.init(this);

const SUGGEST_URL =
  "https://example.com/browser/browser/components/urlbar/tests/browser/searchSuggestionEngine.sjs";
const SEARCH_URL =
  "https://example.com/browser/browser/components/modal/tests/browser/page.html";

add_task(
  async function remote_search_suggestions_require_an_explicit_engine_scope() {
    await gModalNavigation.urlbar.ready;
    const prefs = [
      ["browser.search.suggest.enabled", true],
      ["browser.urlbar.suggest.searches", false],
    ];
    for (const [pref, value] of prefs) {
      Assert.equal(
        Services.prefs.getDefaultBranch("").getBoolPref(pref),
        value,
        `${pref} has the expected product default`
      );
    }
    await SpecialPowers.pushPrefEnv({ clear: prefs.map(([pref]) => [pref]) });
    await SearchTestUtils.installSearchExtension(
      {
        name: "Suggestion Privacy Test",
        keyword: "@privacy",
        search_url: SEARCH_URL,
        search_url_get_params: "q={searchTerms}",
        suggest_url: SUGGEST_URL,
        suggest_url_get_params: "query={searchTerms}",
      },
      { setAsDefault: true }
    );
    const engine = await SearchService.getDefault();
    const bookmark = await PlacesUtils.bookmarks.insert({
      parentGuid: PlacesUtils.bookmarks.unfiledGuid,
      url: `${SEARCH_URL}?local-bookmark`,
      title: "No remote bookmark",
    });
    const requests = [];
    const observe = subject => {
      const url = subject.QueryInterface(Ci.nsIHttpChannel).URI.spec;
      if (url.startsWith(SUGGEST_URL)) {
        requests.push(url);
      }
    };
    Services.obs.addObserver(observe, "http-on-modify-request");
    try {
      for (const entry of [
        "f",
        "e",
        "click",
        "newtab",
        "s",
        "alias",
        "picker",
      ]) {
        await BrowserTestUtils.withNewTab("about:blank", async browser => {
          requests.length = 0;
          const remoteSuggestions = ["s", "alias", "picker"].includes(entry);
          let tab;
          try {
            browser.focus();
            gModalNavigation.setMode("command");
            if (entry === "click") {
              EventUtils.synthesizeMouseAtCenter(gURLBar.inputField, {});
            } else if (entry === "newtab") {
              const opened = BrowserTestUtils.waitForNewTab(gBrowser);
              BrowserCommands.openTab();
              tab = await opened;
              browser = tab.linkedBrowser;
            } else {
              EventUtils.synthesizeKey(" ");
              EventUtils.synthesizeKey(
                ["alias", "picker"].includes(entry) ? "f" : entry
              );
            }
            await TestUtils.waitForCondition(() => gURLBar.focused);
            if (entry === "s") {
              await TestUtils.waitForCondition(
                () => gURLBar.searchMode?.engineName === engine.name
              );
            } else if (entry === "alias") {
              EventUtils.sendString("@privacy ");
              await TestUtils.waitForCondition(
                () =>
                  gURLBar.searchMode?.engineName === engine.name &&
                  !gURLBar.searchMode.isPreview
              );
            } else if (entry === "picker") {
              EventUtils.sendString("pending query");
              await UrlbarTestUtils.promiseSearchComplete(window);
              Assert.equal(
                requests.length,
                0,
                "The query stays local before opening the picker"
              );
              EventUtils.synthesizeKey(" ", { ctrlKey: true });
              await TestUtils.waitForCondition(
                () => gModalNavigation.urlbar.mode === "engines"
              );
              await UrlbarTestUtils.promiseSearchComplete(window);
              const context = await gURLBar.lastQueryContextPromise;
              const index = context.results.findIndex(
                result => result.payload.engine === engine.name
              );
              Assert.greaterOrEqual(index, 0);
              gURLBar.view.selectedRowIndex = -1;
              for (let i = 0; i <= index; i++) {
                EventUtils.synthesizeKey("n", { ctrlKey: true });
              }
              Assert.equal(
                requests.length,
                0,
                "Opening and cycling through engines does not fetch remote suggestions"
              );
              EventUtils.synthesizeKey("KEY_Enter");
              await TestUtils.waitForCondition(
                () =>
                  gModalNavigation.urlbar.mode !== "engines" &&
                  gURLBar.searchMode?.engineName === engine.name
              );
              await UrlbarTestUtils.promiseSearchComplete(window);
              Assert.ok(
                requests.some(
                  url =>
                    new URL(url).searchParams.get("query") === "pending query"
                ),
                "Confirming an engine enables suggestions for the preserved query"
              );
            }
            gURLBar.select();
            let query = "";
            for (const text of ["no", " remote"]) {
              query += text;
              EventUtils.sendString(text);
              await UrlbarTestUtils.promiseSearchComplete(window);
              if (remoteSuggestions) {
                Assert.ok(
                  requests.some(
                    url => new URL(url).searchParams.get("query") === query
                  ),
                  `${entry}: the selected engine receives the query for suggestions`
                );
                Assert.ok(
                  (await gURLBar.lastQueryContextPromise).results.some(
                    result => result.payload.suggestion === `${query}foo`
                  ),
                  "Remote suggestions are displayed in engine mode"
                );
              } else {
                Assert.equal(
                  requests.length,
                  0,
                  `${entry}: typing does not contact the suggestion endpoint`
                );
              }
            }
            if (["f", "e", "click", "newtab"].includes(entry)) {
              Assert.ok(
                (await gURLBar.lastQueryContextPromise).results.some(
                  result => result.payload.url === bookmark.url.href
                ),
                "Local bookmark suggestions remain available"
              );
            }
            const loaded = BrowserTestUtils.browserLoaded(
              browser,
              false,
              engine.getSubmission("no remote").uri.spec
            );
            const requestCount = requests.length;
            EventUtils.synthesizeKey("KEY_Enter");
            await loaded;
            Assert.equal(
              requests.length,
              requestCount,
              "Submitting the search does not fetch suggestions"
            );
            if (remoteSuggestions) {
              browser.focus();
              EventUtils.synthesizeKey(" ");
              EventUtils.synthesizeKey("f");
              await TestUtils.waitForCondition(
                () => gURLBar.focused && !gURLBar.searchMode
              );
              requests.length = 0;
              EventUtils.sendString("back to local");
              await UrlbarTestUtils.promiseSearchComplete(window);
              Assert.equal(
                requests.length,
                0,
                "Returning to default mode stops remote suggestions"
              );
            }
          } finally {
            if (tab) {
              BrowserTestUtils.removeTab(tab);
            }
          }
        });
      }
    } finally {
      Services.obs.removeObserver(observe, "http-on-modify-request");
      await PlacesUtils.bookmarks.remove(bookmark.guid);
      await SpecialPowers.popPrefEnv();
    }
  }
);
