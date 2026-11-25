/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global gModalNavigation */

const FULLSCREEN_PAGE =
  "https://example.com/browser/browser/components/modal/tests/browser/keyboard.html";
const { DOMFullscreenTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/DOMFullscreenTestUtils.sys.mjs"
);
DOMFullscreenTestUtils.init(this, window);

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["full-screen-api.allow-trusted-requests-only", false],
      ["full-screen-api.transition-duration.enter", "0 0"],
      ["full-screen-api.transition-duration.leave", "0 0"],
    ],
  });
  registerCleanupFunction(async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    }
  });
});

async function enterFullscreen(browser, context = browser, video = false) {
  browser.focus();
  const entered = DOMFullscreenTestUtils.waitForFullScreenState(browser, true);
  await SpecialPowers.spawn(context, [video], async useVideo => {
    const target = useVideo
      ? content.document.body.appendChild(
          content.document.createElement("video")
        )
      : content.document.body;
    await target.requestFullscreen();
  });
  await entered;
  Assert.equal(
    gModalNavigation.mode,
    "insert",
    "Fullscreen enters insert mode"
  );
  Assert.equal(document.activeElement, browser, "Fullscreen focuses the page");
}

async function exitFullscreen(browser, escape = false) {
  const exited = DOMFullscreenTestUtils.waitForFullScreenState(browser, false);
  if (escape) {
    EventUtils.synthesizeKey("KEY_Escape");
  } else {
    await SpecialPowers.spawn(browser, [], () =>
      content.document.exitFullscreen()
    );
  }
  await exited;
  Assert.equal(
    gModalNavigation.mode,
    "command",
    "Fullscreen exits to command mode"
  );
  Assert.equal(document.activeElement, browser, "Exit keeps focus on the page");
}

add_task(async function fullscreen_discards_previous_mode() {
  await BrowserTestUtils.withNewTab(FULLSCREEN_PAGE, async browser => {
    await SimpleTest.promiseFocus(window);
    for (const mode of ["command", "insert", "address", "search"]) {
      browser.focus();
      if (mode === "address") {
        await gModalNavigation.urlbar.open("search");
      } else if (mode === "search") {
        await gModalNavigation.find.open();
      } else {
        gModalNavigation.setMode(mode);
      }
      Assert.equal(gModalNavigation.mode, mode, "Start in the requested mode");
      await enterFullscreen(browser, browser, mode === "command");
      EventUtils.synthesizeKey("j");
      await SpecialPowers.spawn(browser, [], async () => {
        await ContentTaskUtils.waitForCondition(() =>
          content.wrappedJSObject.keyEvents.some(
            event => event.type === "keyup" && event.key === "j"
          )
        );
        Assert.deepEqual(
          content.wrappedJSObject.keyEvents.map(
            event => `${event.type}:${event.key}`
          ),
          ["keydown:j", "keypress:j", "keyup:j"],
          "Fullscreen forwards the entire command-key sequence"
        );
        content.wrappedJSObject.keyEvents.length = 0;
      });
      await exitFullscreen(browser, mode !== "insert");
      EventUtils.synthesizeKey("KEY_Escape", { repeat: 3 });
      EventUtils.synthesizeKey("x");
      await SpecialPowers.spawn(browser, [], () => {
        Assert.deepEqual(
          content.wrappedJSObject.keyEvents,
          [],
          "Escape and subsequent command keys stay private"
        );
      });
    }
  });
});

add_task(async function embedded_player_fullscreen() {
  await BrowserTestUtils.withNewTab(FULLSCREEN_PAGE, async browser => {
    browser.focus();
    await SpecialPowers.spawn(browser, [FULLSCREEN_PAGE], async url => {
      const frame = content.document.createElement("iframe");
      frame.allowFullscreen = true;
      frame.src = url.replace("example.com", "example.org");
      const loaded = new Promise(resolve =>
        frame.addEventListener("load", resolve, { once: true })
      );
      content.document.body.appendChild(frame);
      await loaded;
      frame.focus();
    });
    const context = browser.browsingContext.children[0];
    await enterFullscreen(browser, context);
    EventUtils.synthesizeKey("k");
    await SpecialPowers.spawn(context, [], async () => {
      await ContentTaskUtils.waitForCondition(() =>
        content.wrappedJSObject.keyEvents.some(
          event => event.type === "keyup" && event.key === "k"
        )
      );
    });
    EventUtils.synthesizeKey("k", { altKey: true });
    await SpecialPowers.spawn(context, [], async () => {
      await ContentTaskUtils.waitForCondition(() =>
        content.wrappedJSObject.keyEvents.some(
          event => event.type === "keyup" && event.key === "ArrowUp"
        )
      );
      const arrows = content.wrappedJSObject.keyEvents.filter(event =>
        event.key.startsWith("Arrow")
      );
      Assert.deepEqual(
        arrows.map(event => event.type),
        ["keydown", "keyup"],
        "Insert shortcuts send arrows to fullscreen frames"
      );
      Assert.ok(arrows.every(event => !event.ctrlKey && !event.altKey));
    });
    await exitFullscreen(browser, true);
  });
});

add_task(async function switching_tabs_exits_fullscreen_in_command_mode() {
  await BrowserTestUtils.withNewTab(FULLSCREEN_PAGE, async browser => {
    const tab = BrowserTestUtils.addTab(gBrowser, FULLSCREEN_PAGE);
    try {
      browser.focus();
      await enterFullscreen(browser);
      const exited = DOMFullscreenTestUtils.waitForFullScreenState(
        browser,
        false
      );
      await BrowserTestUtils.switchTab(gBrowser, tab);
      await exited;
      Assert.equal(
        gModalNavigation.mode,
        "command",
        "The new tab stays in command mode"
      );
      await BrowserTestUtils.switchTab(
        gBrowser,
        gBrowser.getTabForBrowser(browser)
      );
      Assert.equal(
        gModalNavigation.mode,
        "command",
        "Returning does not revive insert mode"
      );
    } finally {
      BrowserTestUtils.removeTab(tab);
    }
  });
});

add_task(async function enabling_modal_navigation_during_fullscreen() {
  await BrowserTestUtils.withNewTab(FULLSCREEN_PAGE, async browser => {
    browser.focus();
    await enterFullscreen(browser);
    await SpecialPowers.pushPrefEnv({
      set: [["browser.modal.enabled", false]],
    });
    await SpecialPowers.popPrefEnv();
    Assert.equal(
      gModalNavigation.mode,
      "insert",
      "Re-enabling keeps fullscreen passthrough"
    );
    await exitFullscreen(browser, true);
  });
});

add_task(async function window_fullscreen_does_not_change_mode() {
  await BrowserTestUtils.withNewTab(FULLSCREEN_PAGE, async browser => {
    browser.focus();
    gModalNavigation.setMode("command");
    try {
      const entered = BrowserTestUtils.waitForEvent(window, "fullscreen");
      window.fullScreen = true;
      await entered;
      Assert.equal(
        gModalNavigation.mode,
        "command",
        "Window fullscreen keeps command mode"
      );
      gModalNavigation.setMode("insert");
    } finally {
      const exited = BrowserTestUtils.waitForEvent(window, "fullscreen");
      window.fullScreen = false;
      await exited;
    }
    Assert.equal(
      gModalNavigation.mode,
      "insert",
      "Window fullscreen exit keeps insert mode"
    );
  });
});
