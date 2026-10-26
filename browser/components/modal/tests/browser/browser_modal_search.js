/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global gModalNavigation */

const SEARCH_PAGE =
  "https://example.com/browser/browser/components/modal/tests/browser/search.html";
const TERM = "luminous quasar";

function findResult(browser, query = TERM) {
  return new Promise(resolve => {
    const listener = {
      onFindResult(result) {
        if (result.searchString === query) {
          browser.finder.removeResultListener(listener);
          resolve(result);
        }
      },
    };
    browser.finder.addResultListener(listener);
  });
}

async function openSearch(browser) {
  browser.focus();
  EventUtils.synthesizeKey("/");
  const bar = await gFindBarPromise;
  await TestUtils.waitForCondition(
    () => document.activeElement === bar._findField
  );
  return bar;
}

async function selectedMatch(browser) {
  return SpecialPowers.spawn(browser, [], () => {
    const range = content.windowGlobalChild
      .getActor("Finder")
      .finder._fastFind.getFoundRange();
    return range?.startContainer.parentElement.closest(".match")?.id;
  });
}

async function highlightsCleared(browser) {
  await SpecialPowers.spawn(browser, [], async () => {
    const finder = content.windowGlobalChild.getActor("Finder").finder;
    await ContentTaskUtils.waitForCondition(
      () =>
        finder
          ._getSelectionController(content)
          .getSelection(Ci.nsISelectionController.SELECTION_FIND).rangeCount ===
        0,
      "Closing search clears all highlights"
    );
    Assert.ok(
      content.getSelection().isCollapsed,
      "The current match selection is cleared too"
    );
  });
}

add_task(async function insert_mode_passes_slash_to_the_page() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["accessibility.typeaheadfind", true],
      ["accessibility.typeaheadfind.manual", true],
    ],
  });
  try {
    await BrowserTestUtils.withNewTab(SEARCH_PAGE, async browser => {
      browser.focus();
      EventUtils.synthesizeKey("i");
      EventUtils.sendString("/x");
      await SpecialPowers.spawn(browser, [], async () => {
        await ContentTaskUtils.waitForCondition(
          () => content.wrappedJSObject.keypresses.length >= 2
        );
        Assert.deepEqual(
          content.wrappedJSObject.keypresses.map(event => event.key),
          ["/", "x"]
        );
        Assert.ok(
          content.wrappedJSObject.keypresses.every(
            event => !event.defaultPrevented
          ),
          "Native type-ahead find does not consume insert-mode keys"
        );
      });
      Assert.equal(gModalNavigation.mode, "insert");
      Assert.ok(!gFindBarInitialized || gFindBar.hidden);
      await BrowserTestUtils.synthesizeMouseAtCenter("#editor", {}, browser);
      EventUtils.synthesizeKey("/");
      await SpecialPowers.spawn(browser, [], async () => {
        await ContentTaskUtils.waitForCondition(
          () => content.document.getElementById("editor").value === "/",
          "The editor receives the slash"
        );
      });
      Assert.ok(!gFindBarInitialized || gFindBar.hidden);
      EventUtils.synthesizeKey("KEY_Escape");
    });
  } finally {
    await SpecialPowers.popPrefEnv();
  }
});

add_task(async function search_is_committed_only_by_enter() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["findbar.highlightAll", false],
      ["findbar.modalHighlight", false],
    ],
  });
  try {
    await BrowserTestUtils.withNewTab(SEARCH_PAGE, async browser => {
      const normal = getComputedStyle(
        document.getElementById("nav-bar")
      ).backgroundColor;
      const bar = await openSearch(browser);
      Assert.equal(gModalNavigation.mode, "search");
      for (const shiftKey of [false, true]) {
        EventUtils.synthesizeKey("KEY_Tab", { shiftKey });
        Assert.equal(document.activeElement, bar._findField);
        Assert.equal(gModalNavigation.mode, "search");
      }
      Assert.equal(
        getComputedStyle(document.getElementById("nav-bar")).backgroundColor,
        normal,
        "Page search does not use the green insert-mode fill"
      );
      const original = browser.finder.fastFind;
      let calls = 0;
      browser.finder.fastFind = function (...args) {
        calls++;
        return original.apply(this, args);
      };
      try {
        EventUtils.sendString("luminous");
        bar.getElement("highlight").click();
        Assert.ok(bar.getElement("highlight").checked);
        await SpecialPowers.spawn(browser, [], () => {
          Assert.equal(
            content.scrollY,
            0,
            "Partial input does not scroll the page"
          );
          const finder = content.windowGlobalChild.getActor("Finder").finder;
          Assert.equal(
            finder
              ._getSelectionController(content)
              .getSelection(Ci.nsISelectionController.SELECTION_FIND)
              .rangeCount,
            0,
            "Highlight All waits for a submitted query"
          );
        });
        Assert.equal(calls, 0);
        EventUtils.sendString(" quasar");
        const found = findResult(browser);
        EventUtils.synthesizeKey("KEY_Enter");
        await found;
        Assert.equal(calls, 1);
        await SpecialPowers.spawn(browser, [], async () => {
          await ContentTaskUtils.waitForCondition(() => content.scrollY > 0);
        });
        Assert.equal(await selectedMatch(browser), "first");
        for (const shiftKey of [false, false, true]) {
          EventUtils.synthesizeKey("KEY_Enter", { shiftKey });
        }
        Assert.equal(calls, 1, "Repeated Enter does not issue another search");
        Assert.equal(
          await selectedMatch(browser),
          "first",
          "Enter does not cycle matches"
        );
        EventUtils.synthesizeKey("KEY_F3");
        await TestUtils.waitForTick();
        Assert.equal(
          await selectedMatch(browser),
          "first",
          "Search-mode shortcuts do not advance results"
        );
        Assert.equal(gModalNavigation.mode, "command");
        Assert.equal(document.activeElement, browser);
        await SpecialPowers.spawn(browser, [], async () => {
          const finder = content.windowGlobalChild.getActor("Finder").finder;
          const selection = finder
            ._getSelectionController(content)
            .getSelection(Ci.nsISelectionController.SELECTION_FIND);
          await ContentTaskUtils.waitForCondition(
            () => selection.rangeCount === 3
          );
        });
        EventUtils.synthesizeKey("KEY_Escape");
        await TestUtils.waitForCondition(
          () => document.activeElement === browser
        );
        Assert.equal(gModalNavigation.mode, "command");
        Assert.ok(
          !bar.hidden,
          "Command-mode Escape leaves the search bar visible"
        );
        await SpecialPowers.spawn(browser, [], async () => {
          const finder = content.windowGlobalChild.getActor("Finder").finder;
          await new Promise(resolve =>
            content.requestAnimationFrame(() =>
              content.requestAnimationFrame(resolve)
            )
          );
          Assert.equal(
            finder
              ._getSelectionController(content)
              .getSelection(Ci.nsISelectionController.SELECTION_FIND)
              .rangeCount,
            3,
            "All matches remain highlighted while the search bar is visible"
          );
        });
        let next = findResult(browser);
        EventUtils.synthesizeKey("n");
        await next;
        Assert.equal(await selectedMatch(browser), "second");
        next = findResult(browser);
        EventUtils.synthesizeKey("N");
        await next;
        Assert.equal(await selectedMatch(browser), "first");
        Assert.equal(gModalNavigation.mode, "command");
        Assert.ok(!bar.hidden);
        await openSearch(browser);
        EventUtils.synthesizeKey("KEY_Escape");
        Assert.ok(bar.hidden);
        await highlightsCleared(browser);
      } finally {
        browser.finder.fastFind = original;
      }
    });
  } finally {
    await SpecialPowers.popPrefEnv();
  }
});

add_task(async function escape_discards_an_unsubmitted_search_draft() {
  await BrowserTestUtils.withNewTab(SEARCH_PAGE, async browser => {
    let bar = await openSearch(browser);
    EventUtils.sendString(TERM);
    let result = findResult(browser);
    EventUtils.synthesizeKey("KEY_Enter");
    await result;
    EventUtils.synthesizeKey("KEY_Escape");
    await TestUtils.waitForCondition(() => document.activeElement === browser);
    bar = await openSearch(browser);
    await bar._startFindDeferred?.promise;
    bar._findField.select();
    EventUtils.sendString("unsubmitted text");
    EventUtils.synthesizeKey("KEY_Escape");
    await TestUtils.waitForCondition(() => document.activeElement === browser);
    Assert.equal(bar._findField.value, TERM);
    Assert.ok(bar.hidden);
    EventUtils.synthesizeKey("n");
    await highlightsCleared(browser);
    Assert.ok(bar.hidden, "Navigation does not revive a cancelled search");
  });
});

add_task(async function search_access_keys_require_search_field_focus() {
  await BrowserTestUtils.withNewTab(SEARCH_PAGE, async browser => {
    const bar = await openSearch(browser);
    await document.l10n.translateFragment(bar);
    const controls = [...bar.querySelectorAll("checkbox[accesskey]")];
    Assert.equal(controls.length, 4, "Cover every search option access key");
    for (const control of controls) {
      Assert.ok(!control.disabled, "Search options are enabled while editing");
      const checked = control.checked;
      const key = control.getAttribute("accesskey");
      EventUtils.synthesizeKey(key, { altKey: true });
      Assert.equal(
        control.checked,
        !checked,
        "Access key works in search mode"
      );
      EventUtils.synthesizeKey(key, { altKey: true });
      Assert.equal(control.checked, checked);
    }
    EventUtils.sendString(TERM);
    const found = findResult(browser);
    EventUtils.synthesizeKey("KEY_Enter");
    await found;
    const states = controls.map(control => control.checked);
    for (const control of controls) {
      Assert.ok(control.disabled, "Search options are disabled after Enter");
      control.click();
      EventUtils.synthesizeKey(control.getAttribute("accesskey"), {
        altKey: true,
      });
    }
    Assert.deepEqual(
      controls.map(control => control.checked),
      states,
      "Disabled search options ignore clicks and access keys after Enter"
    );
    Assert.equal(gModalNavigation.mode, "command");
    Assert.equal(document.activeElement, browser);
    Assert.equal(await selectedMatch(browser), "first");
    await openSearch(browser);
    Assert.ok(
      controls.every(control => !control.disabled),
      "Refocusing enables all search options"
    );
    const highlight = bar.getElement("highlight");
    const checked = highlight.checked;
    EventUtils.synthesizeKey(highlight.getAttribute("accesskey"), {
      altKey: true,
    });
    Assert.equal(
      highlight.checked,
      !checked,
      "Refocusing restores access keys"
    );
    EventUtils.synthesizeKey(highlight.getAttribute("accesskey"), {
      altKey: true,
    });
    EventUtils.synthesizeKey("KEY_Escape");
  });
});

add_task(
  async function highlight_all_and_navigation_follow_bar_visibility_in_remote_frames() {
    await SpecialPowers.pushPrefEnv({
      set: [
        ["findbar.highlightAll", true],
        ["findbar.modalHighlight", false],
      ],
    });
    try {
      await BrowserTestUtils.withNewTab(SEARCH_PAGE, async browser => {
        await SpecialPowers.spawn(
          browser,
          [SEARCH_PAGE.replace("example.com", "example.org")],
          async url => {
            for (const node of content.document.querySelectorAll(".match")) {
              node.textContent = "other text";
            }
            const frame = content.document.createElement("iframe");
            frame.style.cssText =
              "position:fixed;top:0;left:300px;width:350px;height:250px";
            frame.src = url;
            const loaded = ContentTaskUtils.waitForEvent(frame, "load");
            content.document.body.append(frame);
            await loaded;
          }
        );
        const frame = browser.browsingContext.children[0];
        const bar = await openSearch(browser);
        EventUtils.sendString(TERM);
        let found = findResult(browser);
        EventUtils.synthesizeKey("KEY_Enter");
        await found;
        Assert.equal(await selectedMatch(frame), "first");
        await SpecialPowers.spawn(frame, [], async () => {
          const finder = content.windowGlobalChild.getActor("Finder").finder;
          await ContentTaskUtils.waitForCondition(
            () =>
              finder
                ._getSelectionController(content)
                .getSelection(Ci.nsISelectionController.SELECTION_FIND)
                .rangeCount === 3
          );
        });
        EventUtils.synthesizeKey("KEY_Escape");
        await TestUtils.waitForCondition(
          () => document.activeElement === browser
        );
        await SpecialPowers.spawn(frame, [], () => {
          const finder = content.windowGlobalChild.getActor("Finder").finder;
          Assert.equal(
            finder
              ._getSelectionController(content)
              .getSelection(Ci.nsISelectionController.SELECTION_FIND)
              .rangeCount,
            3,
            "Remote-frame highlights remain with the visible search bar"
          );
        });
        found = findResult(browser);
        EventUtils.synthesizeKey("n");
        await found;
        Assert.equal(
          await selectedMatch(frame),
          "second",
          "Navigation continues from the current remote-frame match"
        );
        found = findResult(browser);
        EventUtils.synthesizeKey("N");
        await found;
        Assert.equal(await selectedMatch(frame), "first");
        Assert.ok(!bar.hidden);
        await openSearch(browser);
        EventUtils.synthesizeKey("KEY_Escape");
        Assert.ok(bar.hidden);
        await highlightsCleared(frame);
      });
    } finally {
      await SpecialPowers.popPrefEnv();
    }
  }
);

add_task(
  async function native_quick_find_returns_when_modal_navigation_is_disabled() {
    await SpecialPowers.pushPrefEnv({
      set: [
        ["browser.modal.enabled", false],
        ["accessibility.typeaheadfind.manual", true],
      ],
    });
    try {
      await BrowserTestUtils.withNewTab(SEARCH_PAGE, async browser => {
        browser.focus();
        EventUtils.synthesizeKey("/");
        await TestUtils.waitForCondition(
          () => gFindBarInitialized && !gFindBar.hidden
        );
        Assert.equal(gFindBar.findMode, gFindBar.FIND_TYPEAHEAD);
        gFindBar.close(true);
      });
    } finally {
      await SpecialPowers.popPrefEnv();
    }
  }
);

add_task(async function pdf_search_uses_the_same_commit_and_highlight_policy() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["findbar.highlightAll", true],
      ["accessibility.typeaheadfind.casesensitive", 0],
      ["pdfjs.featuresNotificationImpressionCount", 99],
    ],
  });
  try {
    await BrowserTestUtils.withNewTab("about:blank", async browser => {
      const loaded = BrowserTestUtils.waitForContentEvent(
        browser,
        "textlayerrendered",
        false,
        null,
        true
      );
      BrowserTestUtils.startLoadingURIString(
        browser,
        "https://example.com/browser/toolkit/components/pdfjs/test/file_pdfjs_test.pdf"
      );
      await loaded;
      try {
        const bar = await openSearch(browser);
        EventUtils.sendString("Moz");
        await SpecialPowers.spawn(browser, [], () => {
          const finder =
            content.wrappedJSObject.PDFViewerApplication.findController;
          Assert.equal(
            finder.pageMatches.reduce(
              (sum, matches) => sum + (matches?.length || 0),
              0
            ),
            0,
            "PDF typing does not start a partial search"
          );
        });
        EventUtils.sendString("illa");
        EventUtils.synthesizeKey("KEY_Enter");
        const highlights = await SpecialPowers.spawn(browser, [], async () => {
          const finder =
            content.wrappedJSObject.PDFViewerApplication.findController;
          await ContentTaskUtils.waitForCondition(
            () =>
              finder.selected.matchIdx === 0 &&
              content.document.querySelectorAll(".textLayer .highlight")
                .length > 1
          );
          return content.document.querySelectorAll(".textLayer .highlight")
            .length;
        });
        EventUtils.synthesizeKey("KEY_Enter");
        await SpecialPowers.spawn(browser, [], () => {
          Assert.equal(
            content.wrappedJSObject.PDFViewerApplication.findController.selected
              .matchIdx,
            0
          );
        });
        EventUtils.synthesizeKey("KEY_Escape");
        await TestUtils.waitForCondition(
          () => document.activeElement === browser
        );
        await SpecialPowers.spawn(browser, [highlights], async count => {
          await new Promise(resolve =>
            content.requestAnimationFrame(() =>
              content.requestAnimationFrame(resolve)
            )
          );
          Assert.ok(
            content.wrappedJSObject.PDFViewerApplication.findController
              .highlightMatches
          );
          Assert.equal(
            content.document.querySelectorAll(".textLayer .highlight").length,
            count,
            "PDF highlights stay visible with the search bar"
          );
        });
        EventUtils.synthesizeKey("n");
        await SpecialPowers.spawn(browser, [], async () => {
          const finder =
            content.wrappedJSObject.PDFViewerApplication.findController;
          await ContentTaskUtils.waitForCondition(
            () => finder.selected.matchIdx === 1
          );
        });
        Assert.ok(
          !bar.hidden,
          "PDF next-match navigation keeps the bar visible"
        );
        Assert.equal(gModalNavigation.mode, "command");
        await openSearch(browser);
        EventUtils.synthesizeKey("KEY_Escape");
        Assert.ok(bar.hidden);
        await SpecialPowers.spawn(browser, [], async () => {
          await ContentTaskUtils.waitForCondition(
            () => !content.document.querySelector(".textLayer .highlight"),
            "Cancelling PDF search clears highlights"
          );
        });
      } finally {
        await SpecialPowers.spawn(browser, [], async () => {
          await content.wrappedJSObject.PDFViewerApplication.testingClose();
        });
      }
    });
  } finally {
    await SpecialPowers.popPrefEnv();
  }
});
