/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global gModalNavigation */

const PAGE =
  "https://example.com/browser/browser/components/modal/tests/browser/page.html";

add_setup(function temporary_download_directory() {
  const { Integration } = ChromeUtils.importESModule(
    "resource://gre/modules/Integration.sys.mjs"
  );
  // Opening preferences must not create a Downloads directory in the user's home.
  const directories = () => ({
    getSystemDownloadsDirectory: async () => PathUtils.tempDir,
  });
  Integration.downloads.register(directories);
  registerCleanupFunction(() => Integration.downloads.unregister(directories));
});

async function withLoadingPage(task) {
  const url = PAGE.replace("page.html", "loading.sjs");
  const tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:blank"
  );
  const browser = tab.linkedBrowser;
  const ready = BrowserTestUtils.waitForContentEvent(
    browser,
    "DOMContentLoaded"
  );
  const loaded = BrowserTestUtils.browserLoaded(browser, false, url);
  BrowserTestUtils.startLoadingURIString(browser, url);
  await ready;
  browser.focus();
  let finished = false;
  const finish = async () => {
    await SpecialPowers.spawn(browser, [`${url}?finish`], endpoint =>
      content.fetch(endpoint).then(response => response.text())
    );
    await loaded;
    await TestUtils.waitForTick();
    finished = true;
  };
  try {
    await task(browser, finish);
  } finally {
    if (!finished) {
      await finish();
    }
    BrowserTestUtils.removeTab(tab);
  }
}

add_task(async function insert_survives_load_completion() {
  await withLoadingPage(async (browser, finish) => {
    EventUtils.synthesizeKey("i");
    Assert.equal(gModalNavigation.mode, "insert");
    await finish();
    Assert.equal(
      gModalNavigation.mode,
      "insert",
      "Finishing a document does not undo deliberate insert mode"
    );
    EventUtils.synthesizeKey("KEY_Escape");
    Assert.equal(gModalNavigation.mode, "command");
  });
});

add_task(async function hints_survive_late_layout_and_frames() {
  await withLoadingPage(async (browser, finish) => {
    EventUtils.synthesizeKey("g");
    EventUtils.synthesizeKey("w");
    await TestUtils.waitForCondition(
      () => gModalNavigation.hints?.targets.length === 1
    );
    const session = gModalNavigation.hints;
    const before = await SpecialPowers.spawn(browser, [], async () => {
      const actor = content.windowGlobalChild.getActor("Modal");
      await ContentTaskUtils.waitForCondition(() =>
        actor.overlay?.root.querySelector(".hint")
      );
      return actor.overlay.root.querySelector(".hint").style.top;
    });
    await finish();
    Assert.equal(
      gModalNavigation.hints,
      session,
      "Page completion preserves the session"
    );
    await SpecialPowers.spawn(browser, [before], async oldTop => {
      const actor = content.windowGlobalChild.getActor("Modal");
      const label = actor.overlay.root.querySelector(".hint");
      await ContentTaskUtils.waitForCondition(() => label.style.top !== oldTop);
      const canvas = content.document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = content.getComputedStyle(label).backgroundColor;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      Assert.greater(r, b, "Hint background is yellow");
      Assert.greater(g, b, "Hint background is yellow");
      const target = content.document.getElementById("target");
      const replacement = target.cloneNode(true);
      target.replaceWith(replacement);
      await ContentTaskUtils.waitForCondition(
        () => actor.targets[0] === replacement
      );
      Assert.ok(
        !label.hidden,
        "Replacing a link with the same destination keeps its label"
      );
      const frame = content.document.createElement("iframe");
      const loaded = ContentTaskUtils.waitForEvent(frame, "load");
      frame.src = "about:blank";
      content.document.body.appendChild(frame);
      await loaded;
    });
    await TestUtils.waitForTick();
    Assert.equal(
      gModalNavigation.hints,
      session,
      "Late frame load preserves existing labels"
    );
    EventUtils.synthesizeKey(session.targets[0].label);
    await SpecialPowers.spawn(browser, [], async () => {
      await ContentTaskUtils.waitForCondition(
        () => content.location.hash === "#followed"
      );
    });
  });
});

async function openPage(task) {
  await BrowserTestUtils.withNewTab(PAGE, async browser => {
    browser.focus();
    await TestUtils.waitForCondition(() => gModalNavigation.mode === "command");
    Assert.ok(
      gModalNavigation.focusedActor(),
      "Selected page has a modal actor"
    );
    await task(browser);
  });
}

add_task(async function command_keys_do_not_reach_page() {
  await openPage(async browser => {
    EventUtils.synthesizeKey("z");
    EventUtils.synthesizeKey("j");
    await SpecialPowers.spawn(browser, [], async () => {
      await ContentTaskUtils.waitForCondition(() => content.scrollY > 0);
      Assert.deepEqual(
        Array.from(content.wrappedJSObject.keys),
        [],
        "Command keys never reach the page"
      );
      Assert.equal(
        content.document.querySelector("input").value,
        "",
        "Autofocus does not enable insert mode"
      );
    });
  });
});

add_task(async function editing_and_tint() {
  await openPage(async browser => {
    const toolbar = document.getElementById("nav-bar");
    const normal = getComputedStyle(toolbar).backgroundColor;
    await BrowserTestUtils.synthesizeMouseAtCenter("#editor", {}, browser);
    await TestUtils.waitForCondition(() => gModalNavigation.mode === "insert");
    Assert.notEqual(
      getComputedStyle(toolbar).backgroundColor,
      normal,
      "Insert mode tints the toolbar"
    );
    Assert.notEqual(
      getComputedStyle(toolbar).backgroundColor,
      "rgba(0, 0, 0, 0)",
      "Tint is not an invalid transparent color"
    );
    EventUtils.synthesizeKey("j");
    await SpecialPowers.spawn(browser, [], () => {
      Assert.equal(content.document.querySelector("input").value, "j");
    });
    EventUtils.synthesizeKey("KEY_Escape");
    await TestUtils.waitForCondition(() => gModalNavigation.mode === "command");
    Assert.equal(
      getComputedStyle(toolbar).backgroundColor,
      normal,
      "Command mode restores the theme"
    );
    EventUtils.synthesizeKey("i");
    await SpecialPowers.spawn(browser, [], async () => {
      await ContentTaskUtils.waitForCondition(
        () => content.document.activeElement.id === "editor"
      );
    });
    EventUtils.synthesizeKey("k");
    await SpecialPowers.spawn(browser, [], () => {
      Assert.equal(
        content.document.querySelector("input").value,
        "jk",
        "i restores the editor without typing i"
      );
    });
  });
});

add_task(async function keyboard_focus_and_tab_restore() {
  await openPage(async browser => {
    await SpecialPowers.spawn(browser, [], () =>
      content.document.getElementById("first").focus()
    );
    EventUtils.synthesizeKey("KEY_Tab", { shiftKey: true });
    await TestUtils.waitForCondition(
      () => gModalNavigation.mode === "insert",
      "Tabbing to an editor enters insert mode"
    );
    EventUtils.synthesizeKey("a");
    const original = gBrowser.selectedTab;
    const other = await BrowserTestUtils.openNewForegroundTab(
      gBrowser,
      "about:blank"
    );
    try {
      await BrowserTestUtils.switchTab(gBrowser, original);
      browser.focus();
      EventUtils.synthesizeKey("z");
      await SpecialPowers.spawn(browser, [], () => {
        Assert.equal(
          content.document.getElementById("editor").value,
          "a",
          "Restored editor cannot swallow a command key"
        );
      });
      Assert.equal(
        gModalNavigation.mode,
        "command",
        "Tab switches retain command mode"
      );
    } finally {
      BrowserTestUtils.removeTab(other);
    }
  });
});

add_task(async function cross_origin_hints_and_cancellation() {
  await openPage(async browser => {
    await SpecialPowers.spawn(
      browser,
      [PAGE.replace("example.com", "example.org")],
      async url => {
        const frame = content.document.createElement("iframe");
        frame.src = url;
        const loaded = new Promise(resolve =>
          frame.addEventListener("load", resolve, { once: true })
        );
        content.document.body.appendChild(frame);
        await loaded;
      }
    );
    const frame = browser.browsingContext.children[0];
    Assert.notEqual(
      frame.currentWindowGlobal.osPid,
      browser.browsingContext.currentWindowGlobal.osPid,
      "Frame is in a different process"
    );
    EventUtils.synthesizeKey("g");
    EventUtils.synthesizeKey("w");
    await TestUtils.waitForCondition(
      () => gModalNavigation.hints?.targets.length === 4
    );
    const targets = gModalNavigation.hints.targets;
    Assert.equal(
      new Set(targets.map(target => target.label)).size,
      4,
      "Labels are unique across frames"
    );
    await SpecialPowers.spawn(frame, [], async () => {
      const actor = content.windowGlobalChild.getActor("Modal");
      await ContentTaskUtils.waitForCondition(() =>
        actor.overlay?.root.querySelector(".hint")
      );
      const label = actor.overlay.root.querySelector(".hint");
      await ContentTaskUtils.waitForCondition(
        () => content.getComputedStyle(label).position === "fixed"
      );
      Assert.greater(
        label.getBoundingClientRect().width,
        0,
        "Frame hint is rendered"
      );
      Assert.notEqual(
        content.getComputedStyle(label).backgroundColor,
        "rgba(0, 0, 0, 0)",
        "Hint background is visible"
      );
      Assert.greater(
        parseFloat(content.getComputedStyle(label).borderTopWidth),
        0,
        "Hint border tokens resolve"
      );
      Assert.ok(
        label.textContent.includes("First link"),
        "Hint includes the target name for nonvisual discovery"
      );
      Assert.equal(
        content.document.querySelector(".hint"),
        null,
        "Hints are isolated from page DOM"
      );
    });
    EventUtils.synthesizeKey("KEY_Escape");
    Assert.equal(gModalNavigation.hints, null, "Escape cancels hints");
    EventUtils.synthesizeKey("g");
    EventUtils.synthesizeKey("w");
    await TestUtils.waitForCondition(
      () => gModalNavigation.hints?.targets.length === 4
    );
    const target = gModalNavigation.hints.targets.find(
      item => item.actor.browsingContext === frame && item.index === 1
    );
    EventUtils.synthesizeKey(target.label);
    await SpecialPowers.spawn(frame, [], async () => {
      await ContentTaskUtils.waitForCondition(
        () => content.location.hash === "#two"
      );
      Assert.ok(true, "Selected link in cross-origin frame");
    });
  });
});

add_task(async function history_navigation() {
  await openPage(async browser => {
    for (const id of ["first", "second"]) {
      await BrowserTestUtils.synthesizeMouseAtCenter(`#${id}`, {}, browser);
    }
    await TestUtils.waitForCondition(
      () => browser.canGoBack && browser.currentURI.spec === `${PAGE}#two`
    );
    let changed = BrowserTestUtils.waitForLocationChange(
      gBrowser,
      `${PAGE}#one`
    );
    EventUtils.synthesizeKey("o", { ctrlKey: true });
    await changed;
    changed = BrowserTestUtils.waitForLocationChange(gBrowser, `${PAGE}#two`);
    EventUtils.synthesizeKey("i", { ctrlKey: true });
    await changed;
    Assert.equal(
      browser.currentURI.spec,
      `${PAGE}#two`,
      "Helix jump-list keys traverse browser history"
    );
  });
});

add_task(async function binding_overrides() {
  await openPage(async browser => {
    await SpecialPowers.pushPrefEnv({
      set: [
        [
          "browser.modal.keybindings",
          JSON.stringify({ z: "scroll.down", j: null }),
        ],
      ],
    });
    try {
      EventUtils.synthesizeKey("z");
      await SpecialPowers.spawn(browser, [], async () => {
        await ContentTaskUtils.waitForCondition(() => content.scrollY > 0);
        Assert.ok(true, "Custom binding executes the registered action");
      });
    } finally {
      await SpecialPowers.popPrefEnv();
    }
  });
});

add_task(async function disabled_mode_and_address_bar() {
  await openPage(async browser => {
    await SpecialPowers.pushPrefEnv({
      set: [["browser.modal.enabled", false]],
    });
    try {
      EventUtils.synthesizeKey("z");
      await SpecialPowers.spawn(browser, [], () => {
        Assert.equal(
          content.document.getElementById("editor").value,
          "z",
          "Disabled mode preserves native typing"
        );
      });
      Assert.ok(!document.documentElement.hasAttribute("modal-mode"));
    } finally {
      await SpecialPowers.popPrefEnv();
    }
    EventUtils.synthesizeKey(" ");
    EventUtils.synthesizeKey("f");
    await TestUtils.waitForCondition(
      () => document.activeElement === gURLBar.inputField
    );
    EventUtils.synthesizeKey("j");
    Assert.equal(gURLBar.value, "j", "Address-bar text is not a modal command");
    EventUtils.synthesizeKey("KEY_Escape");
    await TestUtils.waitForCondition(() => document.activeElement === browser);
    Assert.equal(document.activeElement, browser);
    Assert.equal(gModalNavigation.mode, "command");
  });
});

add_task(async function tabs_and_hints() {
  await openPage(async browser => {
    const original = gBrowser.selectedTab;
    const other = BrowserTestUtils.addTab(gBrowser, PAGE);
    try {
      const switched = BrowserTestUtils.waitForEvent(
        gBrowser.tabContainer,
        "TabSelect"
      );
      EventUtils.synthesizeKey("g");
      EventUtils.synthesizeKey("n");
      await switched;
      Assert.equal(gBrowser.selectedTab, other);
      Assert.equal(gModalNavigation.mode, "command");
      await BrowserTestUtils.switchTab(gBrowser, original);
      browser.focus();
      EventUtils.synthesizeKey("g");
      EventUtils.synthesizeKey("w");
      await TestUtils.waitForCondition(
        () => gModalNavigation.hints?.targets.length === 2
      );
      const loaded = BrowserTestUtils.waitForLocationChange(
        gBrowser,
        `${PAGE}#two`
      );
      EventUtils.synthesizeKey("s");
      await loaded;
      Assert.equal(gModalNavigation.hints, null);
    } finally {
      BrowserTestUtils.removeTab(other);
    }
  });
});

add_task(async function toolbar_theme_colors() {
  const { AddonManager } = ChromeUtils.importESModule(
    "resource://gre/modules/AddonManager.sys.mjs"
  );
  const original = (await AddonManager.getAddonsByTypes(["theme"])).find(
    theme => theme.isActive
  );
  try {
    for (const name of ["light", "dark"]) {
      const theme = await AddonManager.getAddonByID(
        `firefox-compact-${name}@mozilla.org`
      );
      await theme.enable();
      await openPage(async browser => {
        const toolbar = document.getElementById("nav-bar");
        const normal = getComputedStyle(toolbar).backgroundColor;
        await BrowserTestUtils.synthesizeMouseAtCenter("#editor", {}, browser);
        await TestUtils.waitForCondition(
          () => gModalNavigation.mode === "insert"
        );
        const insert = getComputedStyle(toolbar).backgroundColor;
        const canvas = document.createElementNS(
          "http://www.w3.org/1999/xhtml",
          "canvas"
        );
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = insert;
        ctx.fillRect(0, 0, 1, 1);
        const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
        Assert.greater(a, 0, `${name}: toolbar tint is visible`);
        Assert.greater(g, r, `${name}: tint is green`);
        Assert.greater(g, b, `${name}: tint is green`);
        Assert.equal(
          (r + g + b) / 3 < 128,
          name === "dark",
          "Tint follows the theme brightness"
        );
        Assert.notEqual(insert, normal, `${name}: mode changes toolbar color`);
        EventUtils.synthesizeKey("KEY_Escape");
        Assert.equal(
          getComputedStyle(toolbar).backgroundColor,
          normal,
          `${name}: normal color restored`
        );
        EventUtils.synthesizeKey(" ");
        EventUtils.synthesizeKey("e");
        await TestUtils.waitForCondition(
          () => gModalNavigation.mode === "address"
        );
        Assert.equal(
          getComputedStyle(toolbar).backgroundColor,
          normal,
          `${name}: address mode is not tinted green`
        );
        EventUtils.synthesizeKey("KEY_Escape");
        await TestUtils.waitForCondition(
          () => document.activeElement === browser
        );
      });
    }
  } finally {
    await original.enable();
  }
});

add_task(async function hints_survive_scroll_and_clear_on_disable() {
  await openPage(async browser => {
    EventUtils.synthesizeKey("g");
    EventUtils.synthesizeKey("w");
    await TestUtils.waitForCondition(
      () => gModalNavigation.hints?.targets.length === 2
    );
    await SpecialPowers.spawn(browser, [], async () => {
      const scrolled = ContentTaskUtils.waitForEvent(content, "scroll");
      content.scrollTo(0, 500);
      await scrolled;
    });
    Assert.ok(gModalNavigation.hints, "Scrolling preserves the hint session");
    await SpecialPowers.spawn(browser, [], async () => {
      const scrolled = ContentTaskUtils.waitForEvent(content, "scroll");
      content.scrollTo(0, 0);
      await scrolled;
    });
    await TestUtils.waitForCondition(
      () => gModalNavigation.hints?.targets.length === 2
    );
    await SpecialPowers.spawn(browser, [], async () => {
      const actor = content.windowGlobalChild.getActor("Modal");
      await ContentTaskUtils.waitForCondition(() => actor.overlay);
    });
    await SpecialPowers.pushPrefEnv({
      set: [["browser.modal.enabled", false]],
    });
    try {
      Assert.equal(
        gModalNavigation.hints,
        null,
        "Disabling cancels the session"
      );
      Assert.ok(!document.documentElement.hasAttribute("modal-mode"));
    } finally {
      await SpecialPowers.popPrefEnv();
    }
  });
});

add_task(async function removing_a_frame_keeps_other_hints() {
  await openPage(async browser => {
    await SpecialPowers.spawn(
      browser,
      [PAGE.replace("example.com", "example.org")],
      async url => {
        const frame = content.document.createElement("iframe");
        frame.src = url;
        const loaded = ContentTaskUtils.waitForEvent(frame, "load");
        content.document.body.appendChild(frame);
        await loaded;
      }
    );
    EventUtils.synthesizeKey("g");
    EventUtils.synthesizeKey("w");
    await TestUtils.waitForCondition(
      () => gModalNavigation.hints?.targets.length === 4
    );
    const session = gModalNavigation.hints;
    await SpecialPowers.spawn(browser, [], () =>
      content.document.querySelector("iframe").remove()
    );
    await TestUtils.waitForCondition(
      () => gModalNavigation.hints?.targets.length === 2
    );
    Assert.equal(
      gModalNavigation.hints,
      session,
      "Removing one frame does not cancel other frames' hints"
    );
    EventUtils.synthesizeKey("KEY_Escape");
  });
});

add_task(async function independent_window_modes() {
  await openPage(async () => {
    const second = await BrowserTestUtils.openNewBrowserWindow();
    try {
      await BrowserTestUtils.openNewForegroundTab(second.gBrowser, PAGE);
      second.gBrowser.selectedBrowser.focus();
      await TestUtils.waitForCondition(
        () => second.gModalNavigation.mode === "command"
      );
      EventUtils.synthesizeKey("i", {}, second);
      Assert.equal(second.gModalNavigation.mode, "insert");
      Assert.equal(
        gModalNavigation.mode,
        "command",
        "Insert mode does not leak between windows"
      );
    } finally {
      await BrowserTestUtils.closeWindow(second);
      await SimpleTest.promiseFocus(window);
    }
  });
});

add_task(async function insert_preserves_explicit_control_focus() {
  await openPage(async browser => {
    await BrowserTestUtils.synthesizeMouseAtCenter("#editor", {}, browser);
    await TestUtils.waitForCondition(() => gModalNavigation.mode === "insert");
    EventUtils.synthesizeKey("KEY_Escape");
    await SpecialPowers.spawn(browser, [], () =>
      content.document.getElementById("checkbox").focus()
    );
    EventUtils.synthesizeKey("i");
    EventUtils.synthesizeKey(" ");
    await SpecialPowers.spawn(browser, [], async () => {
      Assert.equal(
        content.document.activeElement.id,
        "checkbox",
        "i preserves the current control"
      );
      await ContentTaskUtils.waitForCondition(
        () => content.document.getElementById("checkbox").checked
      );
      Assert.ok(
        content.document.getElementById("checkbox").checked,
        "Space operates the checkbox in insert mode"
      );
    });
  });
});

add_task(async function internal_pages_support_editing_and_escape() {
  await BrowserTestUtils.withNewTab("about:preferences", async browser => {
    browser.focus();
    await BrowserTestUtils.synthesizeMouseAtCenter("#searchInput", {}, browser);
    await TestUtils.waitForCondition(() => gModalNavigation.mode === "insert");
    EventUtils.synthesizeKey("j");
    await SpecialPowers.spawn(browser, [], () => {
      Assert.equal(
        content.document.getElementById("searchInput").value,
        "j",
        "Internal page fields accept text in insert mode"
      );
    });
    EventUtils.synthesizeKey("KEY_Escape");
    Assert.equal(
      gModalNavigation.mode,
      "command",
      "Escape leaves internal-page editing"
    );
  });
});

add_task(async function modified_shortcuts_override_browser_commands() {
  const blocked = new Set([
    "Browser:OpenFile",
    "View:PageInfo",
    "View:PageSource",
    "Browser:AddBookmarkAs",
    "cmd_print",
    "cmd_find",
  ]);
  const commands = [];
  const onCommand = event => {
    if (blocked.has(event.target.id)) {
      commands.push(event.target.id);
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  };
  window.addEventListener("command", onCommand, true);
  await SpecialPowers.pushPrefEnv({
    set: [["browser.newtabpage.enabled", false]],
  });
  try {
    await openPage(async browser => {
      await SpecialPowers.spawn(browser, [], async () => {
        content.document.activeElement.blur();
        content.scrollTo(0, 0);
        await new Promise(resolve =>
          content.requestAnimationFrame(() =>
            content.requestAnimationFrame(resolve)
          )
        );
      });
      for (const [key, fraction] of [
        ["d", 0.5],
        ["u", 0],
        ["f", 1],
        ["b", 0],
      ]) {
        info(`Testing Ctrl-${key}`);
        EventUtils.synthesizeKey(key, { ctrlKey: true });
        await SpecialPowers.spawn(browser, [fraction], async expected => {
          await ContentTaskUtils.waitForCondition(
            () =>
              Math.abs(content.scrollY - content.innerHeight * expected) <= 1
          );
          Assert.ok(true, `Scrolled to ${expected} viewport heights`);
        });
      }
      EventUtils.synthesizeKey("i", { ctrlKey: true });
      await SpecialPowers.spawn(browser, [], () => {});
      Assert.deepEqual(
        commands,
        [],
        "Modal shortcuts do not execute native browser commands"
      );
    });
    await BrowserTestUtils.withNewTab("about:newtab", async browser => {
      browser.focus();
      await TestUtils.waitForCondition(
        () => gModalNavigation.mode === "command"
      );
      for (const key of ["o", "i", "u", "d", "f", "b"]) {
        EventUtils.synthesizeKey(key, { ctrlKey: true });
      }
      await SpecialPowers.spawn(browser, [], () => {});
      Assert.deepEqual(commands, [], "New-tab pages also use modal shortcuts");
      EventUtils.synthesizeKey("i");
      EventUtils.synthesizeKey("KEY_Escape");
      Assert.equal(
        gModalNavigation.mode,
        "command",
        "Escape works on new-tab pages"
      );
    });
  } finally {
    window.removeEventListener("command", onCommand, true);
    await SpecialPowers.popPrefEnv();
  }
});

add_task(async function subdocument_unload_keeps_keyboard_controller() {
  await BrowserTestUtils.withNewTab("about:preferences", async browser => {
    await SpecialPowers.spawn(browser, [], async () => {
      const frame = content.document.createElementNS(
        "http://www.w3.org/1999/xhtml",
        "iframe"
      );
      frame.src = "about:blank";
      const loaded = ContentTaskUtils.waitForEvent(frame, "load");
      content.document.body.appendChild(frame);
      await loaded;
      const reloaded = ContentTaskUtils.waitForEvent(frame, "load");
      frame.src = "about:blank?reload";
      await reloaded;
      frame.remove();
    });
    browser.focus();
    EventUtils.synthesizeKey("i");
    Assert.equal(
      gModalNavigation.mode,
      "insert",
      "Keys still work after an embedded document unloads"
    );
    EventUtils.synthesizeKey("KEY_Escape");
    Assert.equal(
      gModalNavigation.mode,
      "command",
      "Escape listener is still installed"
    );
  });
});

add_task(async function slash_search_and_chrome_escape() {
  await openPage(async browser => {
    EventUtils.synthesizeKey("/");
    const bar = await gFindBarPromise;
    await TestUtils.waitForCondition(
      () => !bar.hidden && document.activeElement === bar._findField
    );
    const finder = browser.finder;
    const found = new Promise(resolve => {
      const listener = {
        onFindResult(result) {
          if (result.searchString === "First link") {
            finder.removeResultListener(listener);
            resolve(result);
          }
        },
      };
      finder.addResultListener(listener);
    });
    EventUtils.sendString("First link");
    Assert.ok(
      [
        Ci.nsITypeAheadFind.FIND_FOUND,
        Ci.nsITypeAheadFind.FIND_WRAPPED,
      ].includes((await found).result),
      "Page search finds the requested text"
    );
    Assert.equal(
      bar._findField.value,
      "First link",
      "Slash opens a working page search"
    );
    Assert.equal(
      gModalNavigation.mode,
      "insert",
      "Search field accepts normal text"
    );
    EventUtils.synthesizeKey("KEY_Escape");
    Assert.ok(bar.hidden, "Escape closes page search");
    Assert.equal(document.activeElement, browser);
    Assert.equal(
      gModalNavigation.mode,
      "command",
      "Escape recovers command mode from findbar"
    );

    const input = document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "input"
    );
    document.getElementById("nav-bar").appendChild(input);
    try {
      input.focus();
      Assert.equal(gModalNavigation.mode, "insert");
      EventUtils.synthesizeKey("KEY_Escape");
      Assert.equal(document.activeElement, browser);
      Assert.equal(
        gModalNavigation.mode,
        "command",
        "Escape recovers from other browser text fields"
      );
    } finally {
      input.remove();
    }
  });
});

add_task(async function uncluttered_defaults() {
  const defaults = Services.prefs.getDefaultBranch("");
  Assert.equal(defaults.getBoolPref("browser.newtabpage.enabled"), false);
  Assert.equal(
    defaults.getStringPref("browser.startup.homepage"),
    "about:newtab"
  );
  Assert.equal(
    defaults.getStringPref("browser.toolbars.bookmarks.visibility"),
    "never"
  );
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.newtabpage.enabled", false],
      ["browser.toolbars.bookmarks.visibility", "never"],
    ],
  });
  try {
    await BrowserTestUtils.withNewTab("about:newtab", async browser => {
      await SpecialPowers.spawn(browser, [], async () => {
        await ContentTaskUtils.waitForCondition(
          () => content.document.getElementById("modal-shortcuts"),
          "New-tab page shows the keyboard guide"
        );
        Assert.equal(
          content.document.querySelectorAll("input, button, a, iframe").length,
          0,
          "The keyboard guide adds no new-tab controls or feed"
        );
      });
      Assert.ok(
        document.getElementById("PersonalToolbar").collapsed,
        "Bookmarks toolbar starts hidden"
      );
      const announcement = document.getElementById("modal-mode-indicator");
      Assert.equal(
        getComputedStyle(announcement).clipPath,
        "inset(100%)",
        "Mode has no visible text badge"
      );
      Assert.equal(
        getComputedStyle(announcement).position,
        "absolute",
        "Announcement consumes no toolbar space"
      );
    });
  } finally {
    await SpecialPowers.popPrefEnv();
  }
});
