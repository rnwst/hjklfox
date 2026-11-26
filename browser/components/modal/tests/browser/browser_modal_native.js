/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global gModalNavigation */

const { Subprocess } = ChromeUtils.importESModule(
  "resource://gre/modules/Subprocess.sys.mjs"
);
const { SearchService } = ChromeUtils.importESModule(
  "moz-src:///toolkit/components/search/SearchService.sys.mjs"
);
const NATIVE_PAGE =
  "https://example.com/browser/browser/components/modal/tests/browser/buttons.html";
let xdotool;

add_setup(async function native_tools() {
  if (Services.env.get("HJKLFOX_NATIVE_KEYS") === "1") {
    xdotool = await Subprocess.pathSearch("xdotool");
    await SpecialPowers.pushPrefEnv({
      set: [["browser.search.suggest.enabled", false]],
    });
  }
});

add_task(
  { skip_if: () => !xdotool },
  async function native_bookmark_shortcut() {
    await SpecialPowers.pushPrefEnv({
      set: [["browser.bookmarks.editDialog.showForNewBookmarks", true]],
    });
    await BrowserTestUtils.withNewTab(
      `${NATIVE_PAGE}?bookmark`,
      async browser => {
        await TestUtils.waitForCondition(() =>
          document.title.includes("Modal native keyboard test")
        );
        await focusNativeBrowser(browser);
        StarUI._createPanelIfNeeded();
        const panel = document.getElementById("editBookmarkPanel");
        try {
          const shown = BrowserTestUtils.waitForEvent(panel, "popupshown");
          await nativeKey("space", " ");
          await nativeKey("shift+m", "Shift");
          await shown;
          Assert.equal(
            document.getElementById("editBookmarkPanelTitle").dataset.l10nId,
            "bookmarks-add-bookmark",
            "Native Space then Shift-m opens the bookmark dialog"
          );
          const hidden = BrowserTestUtils.waitForEvent(panel, "popuphidden");
          await xdo("key", "--clearmodifiers", "Escape");
          await hidden;
          Assert.ok(
            !(await PlacesUtils.bookmarks.fetch({
              url: browser.currentURI.spec,
            })),
            "Escape cancels the new bookmark"
          );
        } finally {
          panel.hidePopup();
          gModalNavigation.enterCommand();
        }
      }
    );
    await SpecialPowers.popPrefEnv();
  }
);

add_task(
  { skip_if: () => !xdotool },
  async function native_address_suggestions() {
    const urls = [
      `${NATIVE_PAGE}?nativepick-one`,
      `${NATIVE_PAGE}?nativepick-two`,
    ];
    await gModalNavigation.urlbar.ready;
    for (const [index, url] of urls.entries()) {
      await PlacesUtils.history.insert({
        url,
        title: `Nativepick ${index}`,
        visits: [{ transition: PlacesUtils.history.TRANSITIONS.LINK }],
      });
    }
    try {
      await BrowserTestUtils.withNewTab(NATIVE_PAGE, async browser => {
        await TestUtils.waitForCondition(() =>
          document.title.includes("Modal native keyboard test")
        );
        await focusNativeBrowser(browser);
        const unexpected = [];
        const onCommand = event => {
          if (["cmd_newNavigator", "cmd_print"].includes(event.target.id)) {
            unexpected.push(event.target.id);
            event.preventDefault();
            event.stopImmediatePropagation();
          }
        };
        window.addEventListener("command", onCommand, true);
        try {
          await nativeKey("space", " ");
          await TestUtils.waitForCondition(() =>
            document
              .getElementById("modal-key-completions")
              ?.matches(":popover-open")
          );
          Assert.equal(
            document.activeElement,
            browser,
            "Native prefix help keeps page focus"
          );
          await nativeKey("f", "f");
          await TestUtils.waitForCondition(
            () => document.activeElement === gURLBar.inputField
          );
          await xdo("type", "--clearmodifiers", "--delay", "1", "abc def");
          await TestUtils.waitForCondition(() => gURLBar.value === "abc def");
          await gURLBar.lastQueryContextPromise;
          gURLBar.inputField.setSelectionRange(3, 3);
          await nativeAddressArrow("h");
          Assert.equal(
            gURLBar.selectionStart,
            2,
            "Native Alt-h moves one character left"
          );
          Assert.equal(gURLBar.value, "abc def", "Alt-h does not delete text");
          await nativeAddressArrow("l");
          Assert.equal(
            gURLBar.selectionStart,
            3,
            "Native Alt-l moves one character right"
          );
          await nativeKey("ctrl+a", "Control");
          await xdo("type", "--clearmodifiers", "--delay", "1", "nativepick");
          await TestUtils.waitForCondition(
            () =>
              gURLBar.value === "nativepick" &&
              [1, 2].every(index =>
                urls.includes(gURLBar.view.getResultAtIndex(index)?.payload.url)
              )
          );
          gURLBar.view.selectedRowIndex = 1;
          const first = gURLBar.view.selectedResult.payload.url;
          await nativeAddressArrow("j");
          Assert.notEqual(
            gURLBar.view.selectedResult.payload.url,
            first,
            "Native Alt-j selects another result"
          );
          await nativeAddressArrow("k");
          Assert.equal(
            gURLBar.view.selectedResult.payload.url,
            first,
            "Native Alt-k returns to the previous result"
          );
          Assert.deepEqual(
            unexpected,
            [],
            "Reserved native commands do not steal result navigation"
          );
          await nativeKey("ctrl+a", "Control");
          await xdo("type", "--clearmodifiers", "--delay", "1", "quasar query");
          await TestUtils.waitForCondition(
            () => gURLBar.value === "quasar query"
          );
          await nativeKey("ctrl+space", "Control");
          await TestUtils.waitForCondition(
            () => gModalNavigation.urlbar.mode === "engines"
          );
          Assert.equal(gURLBar.value, "quasar query");
          await nativeChooseEngine("Perplexity");
          await TestUtils.waitForCondition(
            () =>
              gURLBar.searchMode?.engineName === "Perplexity" &&
              gURLBar.value === "quasar query"
          );
          Assert.equal(
            gModalNavigation.mode,
            "address",
            "Native engine selection stays in address mode and preserves the query"
          );
          await nativeKey("Escape", "Escape");
          await TestUtils.waitForCondition(
            () => document.activeElement === browser
          );
          Assert.equal(
            gModalNavigation.mode,
            "command",
            "One native Escape leaves address editing"
          );
          await nativeKey("space", " ");
          await nativeKey("f", "f");
          await TestUtils.waitForCondition(() => gURLBar.focused);
          await xdo("type", "--clearmodifiers", "--delay", "1", "@");
          await TestUtils.waitForCondition(
            () =>
              gURLBar.value === "@" &&
              gURLBar.view.getResultAtIndex(0)?.payload.providesSearchMode &&
              gURLBar.view.getResultAtIndex(1)?.hideRowLabel
          );
          await gURLBar.lastQueryContextPromise;
          const firstEngine = gURLBar.view.getResultAtIndex(0).payload.engine;
          const previousQuery = gURLBar.lastQueryContextPromise;
          await nativeKey("ctrl+space", "Control");
          await TestUtils.waitForCondition(
            () => gURLBar.lastQueryContextPromise !== previousQuery
          );
          await gURLBar.lastQueryContextPromise;
          Assert.equal(
            gURLBar.value,
            "@",
            "Native Ctrl-Space keeps an active alias picker"
          );
          const engineResult = gURLBar.view.getResultAtIndex(0);
          Assert.equal(engineResult.payload.engine, firstEngine);
          Assert.ok(
            engineResult.hideRowLabel &&
              engineResult.payload.icon &&
              engineResult.payload.keywords,
            "Both native entry points use compact engine choices with aliases and icons"
          );
          await nativeKey("Escape", "Escape");
          await TestUtils.waitForCondition(
            () => document.activeElement === browser
          );
        } finally {
          window.removeEventListener("command", onCommand, true);
        }
      });
    } finally {
      await PlacesUtils.history.remove(urls);
    }
  }
);

async function xdo(...args) {
  const process = await Subprocess.call({ command: xdotool, arguments: args });
  const output = await process.stdout.readString();
  const { exitCode } = await process.wait();
  Assert.equal(exitCode, 0, `xdotool ${args.join(" ")}`);
  return output.trim();
}

add_task(
  { skip_if: () => !xdotool },
  async function native_insert_alt_arrows() {
    const url =
      "https://example.com/browser/browser/components/modal/tests/browser/keyboard.html";
    await BrowserTestUtils.withNewTab(url, async browser => {
      await TestUtils.waitForCondition(() =>
        document.title.includes("Modal keyboard isolation test")
      );
      await focusNativeBrowser(browser, "Modal keyboard isolation test");
      await nativeKey("i", "i");
      await SpecialPowers.spawn(browser, [], () => {
        const editor = content.document.getElementById("editor");
        editor.value = "abc def";
        editor.focus();
        editor.setSelectionRange(3, 3);
      });
      for (const [letter, arrow, position] of [
        ["h", "ArrowLeft", 2],
        ["l", "ArrowRight", 3],
        ["j", "ArrowDown"],
        ["k", "ArrowUp"],
      ]) {
        await SpecialPowers.spawn(browser, [], () => {
          content.wrappedJSObject.keyEvents.length = 0;
        });
        await nativeKey(`alt+${letter}`, "Alt");
        await SpecialPowers.spawn(
          browser,
          [arrow, position],
          async (key, caret) => {
            await ContentTaskUtils.waitForCondition(() =>
              content.wrappedJSObject.keyEvents.some(
                event => event.type === "keyup" && event.key === key
              )
            );
            const events = content.wrappedJSObject.keyEvents.filter(
              event => event.key !== "Alt"
            );
            Assert.deepEqual(
              events.map(event => event.key),
              [key, key]
            );
            Assert.ok(
              events.every(
                event => event.isTrusted && !event.ctrlKey && !event.altKey
              )
            );
            const editor = content.document.getElementById("editor");
            Assert.equal(editor.value, "abc def");
            if (caret !== undefined) {
              Assert.equal(editor.selectionStart, caret);
            }
          }
        );
        Assert.equal(gModalNavigation.mode, "insert");
      }
      await nativeKey("Escape", "Escape");
    });
  }
);

async function nativeAddressArrow(letter) {
  const key = {
    h: "ArrowLeft",
    j: "ArrowDown",
    k: "ArrowUp",
    l: "ArrowRight",
  }[letter];
  const released = BrowserTestUtils.waitForEvent(
    gURLBar.inputField,
    "keyup",
    false,
    event => event.key === key
  );
  await nativeKey(`alt+${letter}`, "Alt");
  await released;
}

async function nativeChooseEngine(name) {
  const context = await gURLBar.lastQueryContextPromise;
  const index = context.results.findIndex(
    result => result.payload.engine === name
  );
  Assert.greaterOrEqual(index, 0, `${name} is in the engine picker`);
  const query = gURLBar.value;
  gURLBar.view.selectedRowIndex = -1;
  for (let i = 0; i <= index; i++) {
    await nativeAddressArrow("j");
    Assert.equal(
      gURLBar.value,
      query,
      "Native engine cycling keeps the query visible"
    );
  }
  await nativeKey("Return", "Enter");
  await TestUtils.waitForCondition(
    () =>
      gURLBar.searchMode?.engineName === name &&
      !gURLBar.searchMode.isPreview &&
      gModalNavigation.urlbar.mode !== "engines"
  );
}

async function focusNativeBrowser(
  browser,
  title = "Modal native keyboard test"
) {
  const ids = await xdo(
    "search",
    "--all",
    "--onlyvisible",
    "--pid",
    String(Services.appinfo.processID),
    "--name",
    title
  );
  const windows = ids.split("\n");
  Assert.equal(
    windows.length,
    1,
    "PID and title identify exactly one test window"
  );
  const id = windows[0];
  Assert.ok(id, "Found the actual Firefox X11 window");
  await xdo("windowfocus", "--sync", id);
  browser.focus();
  await nativeKey("Shift_L", "Shift");
}

async function nativeKey(chord, releasedKey) {
  let released = false;
  const options = { capture: true, mozSystemGroup: true };
  const listener = event => {
    if (event.key === releasedKey) {
      window.windowRoot.removeEventListener("keyup", listener, options);
      Assert.ok(event.isTrusted, "Native key event is trusted");
      released = true;
    }
  };
  window.windowRoot.addEventListener("keyup", listener, options);
  try {
    await xdo("key", "--clearmodifiers", chord);
    await TestUtils.waitForCondition(
      () => released,
      `Firefox received native ${chord}`
    );
    await TestUtils.waitForTick();
  } finally {
    window.windowRoot.removeEventListener("keyup", listener, options);
  }
}

add_task(
  { skip_if: () => !xdotool },
  async function native_clipboard_shortcuts() {
    const url = `${NATIVE_PAGE}?clipboard#fragment`;
    await BrowserTestUtils.withNewTab(url, async browser => {
      await TestUtils.waitForCondition(() =>
        document.title.includes("Modal native keyboard test")
      );
      await focusNativeBrowser(browser);
      await nativeKey("space", " ");
      await nativeKey("y", "y");
      Assert.equal(SpecialPowers.getClipboardData("text/plain"), url);
      const helper = Cc["@mozilla.org/widget/clipboardhelper;1"].getService(
        Ci.nsIClipboardHelper
      );
      helper.copyStringToClipboard(
        "Primary selection is not a URL",
        Services.clipboard.kSelectionClipboard
      );
      const count = gBrowser.tabs.length;
      const opened = BrowserTestUtils.waitForNewTab(gBrowser, url, true);
      await nativeKey("space", " ");
      await nativeKey("p", "p");
      const tab = await opened;
      try {
        Assert.equal(gBrowser.selectedTab, tab);
        Assert.equal(gBrowser.tabs.length, count + 1);
        const currentURL = `${NATIVE_PAGE}?clipboard-current`;
        await SimpleTest.promiseClipboardChange(currentURL, () =>
          helper.copyString(currentURL)
        );
        const loaded = BrowserTestUtils.browserLoaded(
          tab.linkedBrowser,
          false,
          currentURL
        );
        await nativeKey("space", " ");
        await nativeKey("shift+p", "Shift");
        await loaded;
        Assert.equal(gBrowser.selectedTab, tab);
        Assert.equal(gBrowser.tabs.length, count + 1);
        Assert.equal(browser.currentURI.spec, url);

        await SimpleTest.promiseClipboardChange("invalid URL", () =>
          helper.copyString("invalid URL")
        );
        await nativeKey("space", " ");
        await nativeKey("shift+p", "Shift");
        await TestUtils.waitForCondition(() =>
          document
            .getElementById("modal-clipboard-error")
            ?.matches(":popover-open")
        );
        Assert.equal(tab.linkedBrowser.currentURI.spec, currentURL);
        Assert.equal(document.activeElement, tab.linkedBrowser);
        Assert.equal(gModalNavigation.mode, "command");
      } finally {
        BrowserTestUtils.removeTab(tab);
      }
    });
  }
);

add_task(
  { skip_if: () => !xdotool },
  async function native_tabs_do_not_restore_address_mode() {
    await BrowserTestUtils.withNewTab(NATIVE_PAGE, async browser => {
      await TestUtils.waitForCondition(() =>
        document.title.includes("Modal native keyboard test")
      );
      await focusNativeBrowser(browser);
      const original = gBrowser.selectedTab;
      await nativeKey("space", " ");
      await nativeKey("e", "e");
      await TestUtils.waitForCondition(() => gURLBar.focused);
      const opened = BrowserTestUtils.waitForNewTab(gBrowser, "about:newtab");
      await nativeKey("Escape", "Escape");
      await TestUtils.waitForCondition(
        () => gModalNavigation.mode === "command"
      );
      await nativeKey("t", "t");
      await nativeKey("n", "n");
      const other = await opened;
      try {
        await TestUtils.waitForCondition(
          () => gBrowser.selectedTab === other && gURLBar.focused
        );
        await nativeKey("Escape", "Escape");
        await nativeKey("space", " ");
        await nativeKey("e", "e");
        await TestUtils.waitForCondition(
          () => gModalNavigation.mode === "address"
        );
        await nativeKey("ctrl+shift+Tab", "Control");
        Assert.equal(
          gBrowser.selectedTab,
          other,
          "Address mode blocks native tab switching"
        );
        Assert.equal(gModalNavigation.mode, "address");
        await nativeKey("Escape", "Escape");
        const switched = BrowserTestUtils.waitForEvent(
          gBrowser,
          "TabSwitchDone"
        );
        await nativeKey("ctrl+shift+Tab", "Control");
        await switched;
        Assert.equal(gBrowser.selectedTab, original);
        Assert.equal(
          document.activeElement,
          browser,
          "Native tab switching restores page focus, not address focus"
        );
        Assert.equal(gModalNavigation.mode, "command");
        await nativeKey("j", "j");
        await SpecialPowers.spawn(browser, [], async () => {
          await ContentTaskUtils.waitForCondition(() => content.scrollY > 0);
        });
      } finally {
        BrowserTestUtils.removeTab(other);
      }
    });
  }
);

add_task(
  { skip_if: () => !xdotool },
  async function native_engine_switching_preserves_and_submits_query() {
    await gModalNavigation.urlbar.ready;
    const original = await SearchService.getDefault();
    const local = await SearchService.addUserEngine({
      name: "Native Cancellation Search",
      url: `${NATIVE_PAGE}?search={searchTerms}`,
    });
    const query = "native cancellation";
    const destination = local.getSubmission(query).uri.spec;
    try {
      await SearchService.setDefault(
        local,
        SearchService.CHANGE_REASON.UNKNOWN
      );
      await BrowserTestUtils.withNewTab(NATIVE_PAGE, async browser => {
        await TestUtils.waitForCondition(() =>
          document.title.includes("Modal native keyboard test")
        );
        await focusNativeBrowser(browser);
        await nativeKey("space", " ");
        await nativeKey("f", "f");
        await TestUtils.waitForCondition(() => gURLBar.focused);
        const engine = await SearchService.getEngineByAlias("@b");
        await xdo("type", "--clearmodifiers", "--delay", "1", "@b ");
        await TestUtils.waitForCondition(
          () =>
            gURLBar.searchMode?.engineName === engine.name &&
            !gURLBar.searchMode.isPreview
        );
        Assert.equal(
          gURLBar.value,
          "",
          "Bing is selected as soon as its alias is followed by a space"
        );
        await xdo("type", "--clearmodifiers", "--delay", "1", query);
        await TestUtils.waitForCondition(() => gURLBar.value === query);
        await nativeKey("ctrl+space", "Control");
        await TestUtils.waitForCondition(
          () => gModalNavigation.urlbar.mode === "engines"
        );
        Assert.equal(gURLBar.searchMode.engineName, engine.name);
        Assert.equal(gURLBar.value, query);
        await nativeChooseEngine(local.name);
        const loaded = BrowserTestUtils.browserLoaded(
          browser,
          false,
          destination
        );
        await nativeKey("Return", "Enter");
        await loaded;
        Assert.equal(
          browser.currentURI.spec,
          destination,
          "A native Enter submits the preserved query after switching engines"
        );
      });
    } finally {
      await SearchService.setDefault(
        original,
        SearchService.CHANGE_REASON.UNKNOWN
      );
      await SearchService.removeEngine(local);
      await PlacesUtils.history.remove(destination);
    }
  }
);

add_task(
  { skip_if: () => !xdotool },
  async function native_alias_completion_inside_engine_picker() {
    await gModalNavigation.urlbar.ready;
    await BrowserTestUtils.withNewTab(NATIVE_PAGE, async browser => {
      await TestUtils.waitForCondition(() =>
        document.title.includes("Modal native keyboard test")
      );
      await focusNativeBrowser(browser);
      await nativeKey("space", " ");
      await nativeKey("e", "e");
      await TestUtils.waitForCondition(() => gURLBar.focused);
      await nativeKey("ctrl+space", "Control");
      await TestUtils.waitForCondition(
        () => gModalNavigation.urlbar.mode === "engines"
      );
      await nativeKey("ctrl+a", "Control");
      const query = "native picker query";
      const engine = await SearchService.getEngineByAlias("@d");
      await xdo("type", "--clearmodifiers", "--delay", "1", `@d ${query}`);
      await TestUtils.waitForCondition(
        () =>
          gURLBar.searchMode?.engineName === engine.name &&
          !gURLBar.searchMode.isPreview &&
          gURLBar.value === query
      );
      Assert.equal(
        gModalNavigation.urlbar.mode,
        null,
        "Native alias completion exits the engine picker"
      );
      Assert.equal(document.activeElement, gURLBar.inputField);
      const submitted = BrowserTestUtils.waitForDocLoadAndStopIt(
        engine.getSubmission(query).uri.spec,
        browser
      );
      await nativeKey("Return", "Enter");
      await submitted;
      Assert.ok(
        true,
        "Native Enter submits the query after Space e, Ctrl-Space, and @d"
      );
    });
  }
);

add_task(
  { skip_if: () => !xdotool },
  async function native_explicit_page_search() {
    await SpecialPowers.pushPrefEnv({
      set: [
        ["findbar.highlightAll", true],
        ["findbar.modalHighlight", false],
      ],
    });
    try {
      await BrowserTestUtils.withNewTab(
        NATIVE_PAGE.replace("buttons.html", "search.html"),
        async browser => {
          await TestUtils.waitForCondition(() =>
            document.title.includes("Modal page search test")
          );
          await focusNativeBrowser(browser, "Modal page search test");
          await nativeKey("i", "i");
          await nativeKey("slash", "/");
          await SpecialPowers.spawn(browser, [], () => {
            Assert.ok(
              content.wrappedJSObject.keypresses.some(
                event => event.key === "/" && !event.defaultPrevented
              ),
              "Native slash reaches the page in insert mode"
            );
          });
          Assert.ok(!gFindBarInitialized || gFindBar.hidden);
          await nativeKey("Escape", "Escape");
          const normal = getComputedStyle(
            document.getElementById("nav-bar")
          ).backgroundColor;
          await nativeKey("slash", "/");
          const bar = await gFindBarPromise;
          await TestUtils.waitForCondition(
            () => document.activeElement === bar._findField
          );
          Assert.equal(gModalNavigation.mode, "search");
          Assert.equal(
            getComputedStyle(document.getElementById("nav-bar"))
              .backgroundColor,
            normal
          );
          await xdo("type", "--clearmodifiers", "--delay", "1", "luminous");
          await SpecialPowers.spawn(browser, [], () =>
            Assert.equal(content.scrollY, 0)
          );
          await xdo("type", "--clearmodifiers", "--delay", "1", " quasar");
          const find = async (chord, key) => {
            const found = new Promise(resolve => {
              const listener = {
                onFindResult(result) {
                  if (result.searchString === "luminous quasar") {
                    browser.finder.removeResultListener(listener);
                    resolve();
                  }
                },
              };
              browser.finder.addResultListener(listener);
            });
            await nativeKey(chord, key);
            await found;
          };
          const selected = () =>
            SpecialPowers.spawn(
              browser,
              [],
              () =>
                content.windowGlobalChild
                  .getActor("Finder")
                  .finder._fastFind.getFoundRange().startContainer.parentElement
                  .id
            );
          await find("Return", "Enter");
          Assert.equal(await selected(), "first");
          const options = [...bar.querySelectorAll("checkbox[accesskey]")];
          Assert.equal(options.length, 4);
          for (const option of options) {
            const checked = option.checked;
            await nativeKey(`alt+${option.getAttribute("accesskey")}`, "Alt");
            Assert.equal(
              option.checked,
              checked,
              "Native access keys are inactive after Enter"
            );
          }
          await nativeKey("Return", "Enter");
          Assert.equal(
            await selected(),
            "first",
            "Native repeated Enter does not advance matches"
          );
          await nativeKey("Escape", "Escape");
          await TestUtils.waitForCondition(
            () => document.activeElement === browser
          );
          await SpecialPowers.spawn(browser, [], async () => {
            const finder = content.windowGlobalChild.getActor("Finder").finder;
            await ContentTaskUtils.waitForCondition(
              () =>
                finder
                  ._getSelectionController(content)
                  .getSelection(Ci.nsISelectionController.SELECTION_FIND)
                  .rangeCount === 3
            );
          });
          await find("n", "n");
          Assert.equal(await selected(), "second");
          await find("shift+n", "Shift");
          Assert.equal(await selected(), "first");
          Assert.equal(gModalNavigation.mode, "command");
          Assert.ok(!bar.hidden);
          await nativeKey("slash", "/");
          await TestUtils.waitForCondition(
            () => document.activeElement === bar._findField
          );
          const highlight = bar.getElement("highlight");
          const checked = highlight.checked;
          await nativeKey(`alt+${highlight.getAttribute("accesskey")}`, "Alt");
          Assert.equal(
            highlight.checked,
            !checked,
            "Native access key works after refocusing search"
          );
          await nativeKey(`alt+${highlight.getAttribute("accesskey")}`, "Alt");
          for (const chord of ["Tab", "shift+Tab"]) {
            await nativeKey(chord, chord === "Tab" ? "Tab" : "Shift");
            Assert.equal(document.activeElement, bar._findField);
          }
          await nativeKey("Escape", "Escape");
          Assert.ok(bar.hidden);
        }
      );
    } finally {
      await SpecialPowers.popPrefEnv();
    }
  }
);

add_task(
  { skip_if: () => !xdotool },
  async function native_page_keyboard_isolation() {
    const url = NATIVE_PAGE.replace("buttons.html", "keyboard.html");
    await BrowserTestUtils.withNewTab(url, async browser => {
      await TestUtils.waitForCondition(() =>
        document.title.includes("Modal keyboard isolation test")
      );
      await focusNativeBrowser(browser, "Modal keyboard isolation test");
      await SpecialPowers.spawn(browser, [], () => {
        content.wrappedJSObject.blockKeys = true;
      });
      await nativeKey("ctrl+shift+F8", "Control");
      await nativeKey("alt+x", "Alt");
      await nativeKey("Tab", "Tab");
      await SpecialPowers.spawn(browser, [], async () => {
        await ContentTaskUtils.waitForCondition(
          () => content.document.activeElement.id === "link"
        );
      });
      await nativeKey("Return", "Enter");
      await SpecialPowers.spawn(browser, [], async () => {
        await ContentTaskUtils.waitForCondition(
          () => content.location.hash === "#destination"
        );
        Assert.deepEqual(
          content.wrappedJSObject.keyEvents,
          [],
          "Native Tab and Enter work without delivering keys to the page"
        );
        content.wrappedJSObject.blockKeys = false;
        content.document.getElementById("button").focus();
      });
      await nativeKey("i", "i");
      await nativeKey("x", "x");
      await nativeKey("Escape", "Escape");
      await nativeKey("F8", "F8");
      await SpecialPowers.spawn(browser, [], () => {
        Assert.deepEqual(
          content.wrappedJSObject.keyEvents.map(
            event => `${event.type}:${event.key}`
          ),
          ["keydown:x", "keypress:x", "keyup:x"],
          "Only insert-mode input reaches the page"
        );
      });
      const { TabStateFlusher } = ChromeUtils.importESModule(
        "moz-src:///browser/components/sessionstore/TabStateFlusher.sys.mjs"
      );
      const closedURL = `${url}?closed`;
      const tab = await BrowserTestUtils.openNewForegroundTab(
        gBrowser,
        closedURL
      );
      await TabStateFlusher.flush(tab.linkedBrowser);
      BrowserTestUtils.removeTab(tab);
      browser.focus();
      await SpecialPowers.spawn(browser, [], () => {
        content.wrappedJSObject.keyEvents = [];
        content.wrappedJSObject.blockKeys = true;
      });
      const restored = BrowserTestUtils.waitForNewTab(gBrowser, closedURL);
      await nativeKey("t", "t");
      await nativeKey("u", "u");
      const reopened = await restored;
      await SpecialPowers.spawn(browser, [], () => {
        Assert.deepEqual(
          content.wrappedJSObject.keyEvents,
          [],
          "Native tu cannot be intercepted by the page"
        );
      });
      BrowserTestUtils.removeTab(reopened);
    });
  }
);

add_task(
  { skip_if: () => !xdotool },
  async function native_strict_insert_routing() {
    const url = NATIVE_PAGE.replace("buttons.html", "keyboard.html");
    await BrowserTestUtils.withNewTab(url, async browser => {
      await TestUtils.waitForCondition(() =>
        document.title.includes("Modal keyboard isolation test")
      );
      await focusNativeBrowser(browser, "Modal keyboard isolation test");
      const commands = [];
      const onCommand = event => {
        commands.push(event.target.id);
        event.preventDefault();
        event.stopImmediatePropagation();
      };
      window.addEventListener("command", onCommand, true);
      try {
        await nativeKey("shift+i", "Shift");
        Assert.equal(gModalNavigation.mode, "strict-insert");
        const tab = gBrowser.selectedTab;
        const count = gBrowser.tabs.length;
        for (const [chord, releasedKey, key] of [
          ["alt+h", "Alt", "h"],
          ["alt+j", "Alt", "j"],
          ["alt+k", "Alt", "k"],
          ["alt+l", "Alt", "l"],
          ["ctrl+w", "Control", "w"],
          ["ctrl+t", "Control", "t"],
          ["ctrl+p", "Control", "p"],
          ["ctrl+f", "Control", "f"],
          ["ctrl+Tab", "Control", "Tab"],
          ["F6", "F6", "F6"],
          ["Alt_L", "Alt", "Alt"],
          ["F10", "F10", "F10"],
          ["shift+F10", "Shift", "F10"],
          ["Menu", "ContextMenu", "ContextMenu"],
          ["F11", "F11", "F11"],
          ["Escape", "Escape", "Escape"],
        ]) {
          await SpecialPowers.spawn(browser, [], () => {
            content.wrappedJSObject.keyEvents.length = 0;
          });
          await nativeKey(chord, releasedKey);
          await SpecialPowers.spawn(browser, [key], expected => {
            const events = content.wrappedJSObject.keyEvents;
            for (const type of ["keydown", "keyup"]) {
              Assert.ok(
                events.some(
                  event => event.key === expected && event.type === type
                ),
                `${expected} ${type} reaches the page`
              );
            }
            Assert.ok(events.every(event => !event.key.startsWith("Arrow")));
          });
          Assert.equal(gModalNavigation.mode, "strict-insert");
          Assert.equal(gBrowser.selectedTab, tab);
          Assert.equal(gBrowser.tabs.length, count);
          Assert.equal(document.activeElement, browser);
          Assert.ok(!window.fullScreen);
        }
        Assert.deepEqual(commands, [], "No browser commands run");
        await SpecialPowers.spawn(browser, [], () => {
          content.wrappedJSObject.keyEvents.length = 0;
        });
        await nativeKey("shift+Escape", "Shift");
        Assert.equal(gModalNavigation.mode, "command");
        await SpecialPowers.spawn(browser, [], () => {
          Assert.ok(
            content.wrappedJSObject.keyEvents.every(
              event => event.key !== "Escape"
            ),
            "The exit chord does not reach the page"
          );
        });
      } finally {
        window.removeEventListener("command", onCommand, true);
        gModalNavigation.enterCommand();
      }
    });
  }
);

add_task({ skip_if: () => !xdotool }, async function native_keyboard_routing() {
  await BrowserTestUtils.withNewTab(NATIVE_PAGE, async browser => {
    await TestUtils.waitForCondition(() =>
      document.title.includes("Modal native keyboard test")
    );
    await focusNativeBrowser(browser);

    const unexpected = [];
    const blocked = new Set([
      "Browser:OpenLocation",
      "Browser:OpenFile",
      "View:PageInfo",
      "View:PageSource",
      "Browser:AddBookmarkAs",
      "cmd_print",
      "cmd_find",
    ]);
    const onCommand = event => {
      if (blocked.has(event.target.id)) {
        unexpected.push(event.target.id);
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    window.addEventListener("command", onCommand, true);
    try {
      await nativeKey("i", "i");
      for (const chord of ["ctrl+d", "ctrl+u", "ctrl+f", "ctrl+p"]) {
        await nativeKey(chord, "Control");
      }
      Assert.deepEqual(
        unexpected,
        [],
        "Native shortcuts do not run in insert mode"
      );
      Assert.equal(gModalNavigation.mode, "insert");
      const selectedTab = gBrowser.selectedTab;
      await nativeKey("ctrl+Tab", "Control");
      Assert.equal(
        gBrowser.selectedTab,
        selectedTab,
        "Insert mode blocks native tab cycling"
      );
      await nativeKey("Escape", "Escape");
      await nativeKey("ctrl+l", "Control");
      Assert.equal(document.activeElement, browser, "Native Ctrl-l is retired");
      await nativeKey("alt+d", "Alt");
      Assert.equal(document.activeElement, browser, "Native Alt-d is retired");
      for (const [chord, fraction] of [
        ["ctrl+d", 0.5],
        ["ctrl+u", 0],
        ["ctrl+f", 1],
        ["ctrl+b", 0],
      ]) {
        await nativeKey(chord, "Control");
        await SpecialPowers.spawn(browser, [fraction], async expected => {
          await ContentTaskUtils.waitForCondition(
            () =>
              Math.abs(content.scrollY - content.innerHeight * expected) <= 1
          );
          Assert.ok(true, `Native scrolling reached ${expected} viewports`);
        });
      }
      await nativeKey("g", "g");
      await nativeKey("w", "w");
      await TestUtils.waitForCondition(
        () => gModalNavigation.hints?.targets.length === 5
      );
      const actionLabel = gModalNavigation.hints.targets[0].label;
      Assert.equal(
        gModalNavigation.mode,
        "hint",
        "Hints have an explicit mode"
      );
      await nativeKey("ctrl+p", "Control");
      Assert.deepEqual(unexpected, [], "Hints suppress native Print");
      await nativeKey(actionLabel, actionLabel);
      await SpecialPowers.spawn(browser, [], async () => {
        await ContentTaskUtils.waitForCondition(
          () => content.document.body.dataset.clicks === "1"
        );
        Assert.equal(
          content.document.body.dataset.trusted,
          "true",
          "Native hint keys activate a real button click"
        );
      });
      await nativeKey("g", "g");
      await nativeKey("w", "w");
      await TestUtils.waitForCondition(
        () => gModalNavigation.hints?.targets.length === 5
      );
      await nativeKey("o", "o");
      Assert.equal(
        gModalNavigation.hints,
        null,
        "An unmatched native hint key exits hint mode without Escape"
      );
      await nativeKey("g", "g");
      await nativeKey("w", "w");
      await TestUtils.waitForCondition(
        () => gModalNavigation.hints?.targets.length === 5
      );
      await nativeKey("ctrl+o", "Control");
      Assert.equal(
        gModalNavigation.hints,
        null,
        "Native Ctrl-o exits hints as a browser command"
      );
      await nativeKey("ctrl+i", "Control");
      await nativeKey("g", "g");
      await nativeKey("w", "w");
      await TestUtils.waitForCondition(
        () => gModalNavigation.hints?.targets.length === 5
      );
      const firstIndex = await SpecialPowers.spawn(browser, [], () =>
        content.windowGlobalChild
          .getActor("Modal")
          .targets.findIndex(target => target.id === "first")
      );
      const label = gModalNavigation.hints.targets[firstIndex].label;
      await nativeKey(label, label);
      await TestUtils.waitForCondition(
        () => browser.currentURI.spec === `${NATIVE_PAGE}#one`
      );
      await nativeKey("ctrl+o", "Control");
      await TestUtils.waitForCondition(
        () => browser.currentURI.spec === NATIVE_PAGE
      );
      await nativeKey("ctrl+i", "Control");
      await TestUtils.waitForCondition(
        () => browser.currentURI.spec === `${NATIVE_PAGE}#one`
      );
      Assert.ok(true, "Native Ctrl-o/Ctrl-i traverse history");
      Assert.deepEqual(
        unexpected,
        [],
        "Native keys never invoke the conflicting Firefox commands"
      );
      await SpecialPowers.spawn(browser, [], () => {
        const input = content.document.createElement("input");
        input.id = "native-editor";
        content.document.body.prepend(input);
        input.focus();
      });
      await nativeKey("i", "i");
      await nativeKey("k", "k");
      await SpecialPowers.spawn(browser, [], async () => {
        await ContentTaskUtils.waitForCondition(
          () => content.document.getElementById("native-editor").value === "k"
        );
      });
      Assert.equal(
        gModalNavigation.mode,
        "insert",
        "Native typing enters page insert mode"
      );
      await nativeKey("Escape", "Escape");
      Assert.equal(gModalNavigation.mode, "command");
      await nativeKey("i", "i");
      await nativeKey("l", "l");
      await SpecialPowers.spawn(browser, [], async () => {
        await ContentTaskUtils.waitForCondition(
          () => content.document.getElementById("native-editor").value === "kl"
        );
        Assert.ok(true, "Native typing resumes the editor after Escape");
      });
      await nativeKey("Escape", "Escape");
      await nativeKey("space", " ");
      await nativeKey("f", "f");
      await TestUtils.waitForCondition(
        () => document.activeElement === gURLBar.inputField
      );
      Assert.equal(
        gModalNavigation.urlbar.mode,
        "destinations",
        "Native Space f opens the replacement picker"
      );
      Assert.equal(
        gModalNavigation.mode,
        "address",
        "The address bar has its own mode"
      );
      await nativeKey("Escape", "Escape");
      await TestUtils.waitForCondition(
        () => document.activeElement === browser
      );
      Assert.equal(gModalNavigation.mode, "command");
      const address = gURLBar.untrimmedValue;
      await nativeKey("space", " ");
      await nativeKey("e", "e");
      await TestUtils.waitForCondition(
        () => document.activeElement === gURLBar.inputField
      );
      Assert.equal(
        gURLBar.untrimmedValue,
        address,
        "Native Space e preserves the address"
      );
      await nativeKey("Tab", "Tab");
      Assert.equal(
        document.activeElement,
        gURLBar.inputField,
        "Native Tab keeps address focus"
      );
      Assert.equal(
        gModalNavigation.mode,
        "address",
        "Native Tab stays in address mode"
      );
      await nativeKey("shift+Tab", "Shift");
      Assert.equal(
        document.activeElement,
        gURLBar.inputField,
        "Native Shift-Tab keeps address focus"
      );
      await nativeKey("Escape", "Escape");
      await TestUtils.waitForCondition(
        () => document.activeElement === browser
      );
      await nativeKey("g", "g");
      await nativeKey("shift+w", "Shift");
      await TestUtils.waitForCondition(
        () => gModalNavigation.hints?.targets.length === 2
      );
      const newTabLabel = gModalNavigation.hints.targets[0].label;
      const sourceURL = browser.currentURI.spec;
      const opened = BrowserTestUtils.waitForNewTab(
        gBrowser,
        `${NATIVE_PAGE}#one`
      );
      await nativeKey(newTabLabel, newTabLabel);
      const tab = await opened;
      try {
        Assert.equal(
          browser.currentURI.spec,
          sourceURL,
          "Native g W opens a new tab without navigating the source"
        );
        Assert.equal(gModalNavigation.hints, null);
      } finally {
        BrowserTestUtils.removeTab(tab);
      }
    } finally {
      window.removeEventListener("command", onCommand, true);
    }
  });
});
