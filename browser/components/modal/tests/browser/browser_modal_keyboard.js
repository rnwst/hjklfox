/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global gModalNavigation */

const KEYBOARD_PAGE =
  "https://example.com/browser/browser/components/modal/tests/browser/keyboard.html";

async function recordedKeys(context, completedKey = null) {
  return SpecialPowers.spawn(context, [completedKey], async key => {
    if (key) {
      await ContentTaskUtils.waitForCondition(() =>
        content.wrappedJSObject.keyEvents.some(
          event => event.type === "keyup" && event.key === key
        )
      );
    }
    return content.wrappedJSObject.keyEvents;
  });
}

add_task(async function command_mode_hides_non_arrow_keyboard_events() {
  await BrowserTestUtils.withNewTab(KEYBOARD_PAGE, async browser => {
    browser.focus();
    await SpecialPowers.spawn(browser, [], () => {
      content.wrappedJSObject.blockKeys = true;
    });
    for (const key of [
      "x",
      "KEY_Shift",
      "KEY_Control",
      "KEY_Alt",
      "KEY_F8",
      "KEY_Escape",
    ]) {
      EventUtils.synthesizeKey(key);
    }
    EventUtils.synthesizeKey("KEY_F8", { ctrlKey: true, shiftKey: true });
    EventUtils.synthesizeKey("x", { altKey: true });
    EventUtils.synthesizeKey("x", { repeat: 3 });
    Assert.deepEqual(
      await recordedKeys(browser),
      [],
      "No press, repeat, or release reaches page listeners"
    );

    EventUtils.synthesizeKey("KEY_Tab");
    await SpecialPowers.spawn(browser, [], async () => {
      await ContentTaskUtils.waitForCondition(
        () => content.document.activeElement.id === "link"
      );
    });
    EventUtils.synthesizeKey("KEY_Enter");
    await SpecialPowers.spawn(browser, [], async () => {
      await ContentTaskUtils.waitForCondition(
        () => content.location.hash === "#destination"
      );
    });
    await SpecialPowers.spawn(browser, [], () =>
      content.document.getElementById("button").focus()
    );
    EventUtils.synthesizeKey("KEY_Enter");
    await SpecialPowers.spawn(browser, [], async () => {
      await ContentTaskUtils.waitForCondition(
        () => content.wrappedJSObject.clicks === 1
      );
      Assert.deepEqual(
        content.wrappedJSObject.keyEvents,
        [],
        "Native focus and activation work without exposing keys"
      );
    });
  });
});

add_task(async function command_mode_passes_arrow_keys_to_pages() {
  await BrowserTestUtils.withNewTab(KEYBOARD_PAGE, async browser => {
    browser.focus();
    await SpecialPowers.spawn(browser, [], () => {
      content.wrappedJSObject.blockKeys = true;
    });
    for (const key of ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]) {
      await SpecialPowers.spawn(browser, [], () => {
        content.wrappedJSObject.keyEvents.length = 0;
      });
      EventUtils.synthesizeKey(`KEY_${key}`, { type: "keydown" });
      await SpecialPowers.spawn(browser, [], () => {});
      EventUtils.synthesizeKey(`KEY_${key}`, { type: "keydown", repeat: 2 });
      await SpecialPowers.spawn(browser, [], () => {});
      EventUtils.synthesizeKey(`KEY_${key}`, { type: "keyup" });
      const events = await recordedKeys(browser, key);
      Assert.ok(
        events.filter(event => event.type === "keydown" && event.key === key)
          .length >= 2 && events.some(event => event.repeat),
        `${key} presses and repeats reach the page`
      );
      Assert.equal(
        events.at(-1).type,
        "keyup",
        `${key} release reaches the page`
      );
      Assert.equal(gModalNavigation.mode, "command");
    }

    await SpecialPowers.spawn(browser, [], () => {
      content.wrappedJSObject.keyEvents.length = 0;
    });
    EventUtils.synthesizeKey("KEY_ArrowDown", { type: "keydown" });
    gModalNavigation.setMode("insert");
    EventUtils.synthesizeKey("KEY_ArrowDown", { type: "keyup" });
    const events = await recordedKeys(browser, "ArrowDown");
    Assert.deepEqual(
      events.map(event => event.type),
      ["keydown", "keyup"],
      "An arrow release still reaches the page after entering insert mode"
    );
    EventUtils.synthesizeKey("KEY_Escape");
  });
});

add_task(async function insert_mode_delivers_keys_but_not_mode_transitions() {
  await BrowserTestUtils.withNewTab(KEYBOARD_PAGE, async browser => {
    browser.focus();
    EventUtils.synthesizeKey("i");
    EventUtils.synthesizeKey("x");
    let events = await recordedKeys(browser, "x");
    Assert.deepEqual(
      events.map(event => `${event.type}:${event.key}`),
      ["keydown:x", "keypress:x", "keyup:x"],
      "Insert forwards the full key sequence, not the entering i"
    );
    EventUtils.synthesizeKey("KEY_Control");
    EventUtils.synthesizeKey("KEY_F8", { ctrlKey: true, shiftKey: true });
    events = await SpecialPowers.spawn(browser, [], async () => {
      await ContentTaskUtils.waitForCondition(() =>
        content.wrappedJSObject.keyEvents.some(
          event => event.type === "keyup" && event.key === "F8"
        )
      );
      return content.wrappedJSObject.keyEvents;
    });
    Assert.ok(
      events.some(event => event.type === "keydown" && event.key === "Control")
    );
    Assert.ok(
      events.some(event => event.type === "keydown" && event.key === "F8")
    );
    Assert.ok(
      events.some(event => event.type === "keyup" && event.key === "F8")
    );
    EventUtils.synthesizeKey("KEY_Escape");
    EventUtils.synthesizeKey("x");
    Assert.deepEqual(
      await recordedKeys(browser),
      events,
      "Escape and subsequent command keys are private"
    );
    Assert.equal(gModalNavigation.mode, "command");

    await SpecialPowers.spawn(browser, [], () =>
      content.document.getElementById("button").focus()
    );
    EventUtils.synthesizeKey("KEY_Tab", { type: "keydown" });
    await TestUtils.waitForCondition(() => gModalNavigation.mode === "insert");
    EventUtils.synthesizeKey("KEY_Tab", { type: "keyup" });
    Assert.deepEqual(
      await recordedKeys(browser),
      events,
      "Tab release does not leak after entering an editor"
    );
    EventUtils.synthesizeKey("q");
    await SpecialPowers.spawn(browser, [], async () => {
      await ContentTaskUtils.waitForCondition(
        () => content.document.getElementById("editor").value === "q"
      );
    });
    EventUtils.synthesizeKey("KEY_Escape");
  });
});

add_task(async function command_mode_protects_reopen_tab_from_page_handlers() {
  const { TabStateFlusher } = ChromeUtils.importESModule(
    "moz-src:///browser/components/sessionstore/TabStateFlusher.sys.mjs"
  );
  await BrowserTestUtils.withNewTab(KEYBOARD_PAGE, async browser => {
    const url = `${KEYBOARD_PAGE}?closed`;
    const tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, url);
    await TabStateFlusher.flush(tab.linkedBrowser);
    BrowserTestUtils.removeTab(tab);
    browser.focus();
    await SpecialPowers.spawn(browser, [], () => {
      content.wrappedJSObject.blockKeys = true;
    });
    const restored = BrowserTestUtils.waitForNewTab(gBrowser, url);
    EventUtils.synthesizeKey("t", { ctrlKey: true, shiftKey: true });
    const reopened = await restored;
    Assert.deepEqual(
      await recordedKeys(browser),
      [],
      "The page cannot observe or cancel the reopen-tab shortcut"
    );
    BrowserTestUtils.removeTab(reopened);
  });
});

add_task(
  async function disabling_modal_navigation_restores_page_keyboard_events() {
    await SpecialPowers.pushPrefEnv({
      set: [["browser.modal.enabled", false]],
    });
    try {
      await BrowserTestUtils.withNewTab(KEYBOARD_PAGE, async browser => {
        browser.focus();
        EventUtils.synthesizeKey("x");
        Assert.deepEqual(
          (await recordedKeys(browser)).map(event => event.type),
          ["keydown", "keypress", "keyup"]
        );
      });
    } finally {
      await SpecialPowers.popPrefEnv();
    }
  }
);

add_task(async function remote_frames_follow_the_window_mode() {
  await BrowserTestUtils.withNewTab(KEYBOARD_PAGE, async browser => {
    await SpecialPowers.spawn(
      browser,
      [KEYBOARD_PAGE.replace("example.com", "example.org")],
      async url => {
        const frame = content.document.createElement("iframe");
        frame.src = url;
        const loaded = ContentTaskUtils.waitForEvent(frame, "load");
        content.document.body.append(frame);
        await loaded;
        frame.focus();
      }
    );
    const frame = browser.browsingContext.children[0];
    browser.focus();
    await SpecialPowers.spawn(frame, [], () => content.focus());
    EventUtils.synthesizeKey("KEY_F8");
    EventUtils.synthesizeKey("y", { ctrlKey: true });
    Assert.deepEqual(
      await recordedKeys(frame),
      [],
      "Remote frames do not receive command-mode keys"
    );
    EventUtils.synthesizeKey("i");
    EventUtils.synthesizeKey("x");
    Assert.deepEqual(
      (await recordedKeys(frame, "x")).map(event => event.key),
      ["x", "x", "x"]
    );
    await SpecialPowers.spawn(frame, [KEYBOARD_PAGE], async url => {
      const nested = content.document.createElement("iframe");
      nested.src = url;
      const loaded = ContentTaskUtils.waitForEvent(nested, "load");
      content.document.body.append(nested);
      await loaded;
    });
    const nested = frame.children[0];
    await SpecialPowers.spawn(nested, [], () => content.focus());
    EventUtils.synthesizeKey("x");
    Assert.deepEqual(
      (await recordedKeys(nested, "x")).map(event => event.key),
      ["x", "x", "x"],
      "A newly created frame inherits insert mode"
    );
    EventUtils.synthesizeKey("KEY_Escape");
    EventUtils.synthesizeKey("KEY_F8");
    Assert.deepEqual(
      (await recordedKeys(nested)).map(event => event.key),
      ["x", "x", "x"]
    );
  });
});
