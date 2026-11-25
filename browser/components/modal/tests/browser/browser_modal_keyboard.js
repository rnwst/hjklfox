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

add_task(async function native_shortcuts_follow_mode_and_prefix() {
  await BrowserTestUtils.withNewTab(KEYBOARD_PAGE, async browser => {
    const commands = [];
    const onCommand = event => {
      commands.push(event.target.id);
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    window.addEventListener("command", onCommand, true);
    try {
      browser.focus();
      for (const mode of ["insert", "address", "search", "select", "hint"]) {
        gModalNavigation.setMode(mode);
        EventUtils.synthesizeKey("p", { accelKey: true });
        await SpecialPowers.spawn(browser, [], () => {});
        Assert.deepEqual(commands, [], `${mode} cannot invoke Print`);
      }
      gModalNavigation.setMode("insert");
      EventUtils.synthesizeKey("d", { ctrlKey: true });
      const events = await recordedKeys(browser, "d");
      Assert.ok(
        events.some(event => event.type === "keydown" && event.key === "d"),
        "Insert mode delivers shortcut input to the page"
      );
      Assert.deepEqual(commands, [], "Ctrl-d does not bookmark");

      gModalNavigation.setMode("command");
      await gModalNavigation.startHints();
      Assert.equal(gModalNavigation.mode, "hint");
      EventUtils.synthesizeKey("w", { ctrlKey: true });
      Assert.equal(
        gModalNavigation.mode,
        "command",
        "A modal prefix leaves hints"
      );
      Assert.equal(
        gModalNavigation.keymap.prefix,
        "C-w",
        "The new prefix survives"
      );
      Assert.ok(
        gModalNavigation.shortcuts.blocked,
        "The prefix still blocks shortcuts"
      );

      gModalNavigation.setMode("command");
      EventUtils.synthesizeKey("g");
      Assert.ok(
        gModalNavigation.shortcuts.blocked,
        "A prefix blocks shortcuts"
      );
      EventUtils.synthesizeKey("p", { accelKey: true });
      await SpecialPowers.spawn(browser, [], () => {});
      Assert.deepEqual(
        commands,
        [],
        "An unmatched shortcut cancels only the prefix"
      );
      EventUtils.synthesizeKey("5");
      Assert.ok(
        !gModalNavigation.shortcuts.blocked,
        "A count permits shortcuts"
      );
      EventUtils.synthesizeKey("p", { accelKey: true });
      await TestUtils.waitForCondition(() => commands.length);
      commands.length = 0;

      gModalNavigation.setMode("insert");
      const popup = document.getElementById("contentAreaContextMenu");
      const shown = BrowserTestUtils.waitForEvent(popup, "popupshown");
      await BrowserTestUtils.synthesizeMouseAtCenter(
        "#button",
        { type: "contextmenu", button: 2 },
        browser
      );
      await shown;
      Assert.equal(
        gModalNavigation.mode,
        "command",
        "Native menu enters command mode"
      );
      Assert.ok(
        !gModalNavigation.shortcuts.blocked,
        "Native menu enables shortcuts"
      );
      const hidden = BrowserTestUtils.waitForEvent(popup, "popuphidden");
      popup.hidePopup();
      await hidden;
      Assert.equal(
        gModalNavigation.mode,
        "command",
        "Closing menu keeps command mode"
      );

      gModalNavigation.setMode("insert");
      await SpecialPowers.pushPrefEnv({
        set: [["browser.modal.enabled", false]],
      });
      try {
        Assert.ok(
          !gModalNavigation.shortcuts.blocked,
          "Disabling modal restores keysets"
        );
      } finally {
        await SpecialPowers.popPrefEnv();
      }
    } finally {
      window.removeEventListener("command", onCommand, true);
      gModalNavigation.setMode("command");
    }
  });
});

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

add_task(async function command_mode_translates_hjkl_to_arrows() {
  await BrowserTestUtils.withNewTab(KEYBOARD_PAGE, async browser => {
    browser.focus();
    await SpecialPowers.spawn(browser, [], () => {
      content.wrappedJSObject.blockKeys = true;
      content.document.body.style.height = "5000px";
    });
    for (const [letter, key] of Object.entries({
      h: "ArrowLeft",
      j: "ArrowDown",
      k: "ArrowUp",
      l: "ArrowRight",
    })) {
      await SpecialPowers.spawn(browser, [], () => {
        content.wrappedJSObject.keyEvents.length = 0;
      });
      EventUtils.synthesizeKey(letter, { type: "keydown" });
      await SpecialPowers.spawn(browser, [], () => {});
      EventUtils.synthesizeKey(letter, { type: "keydown", repeat: 2 });
      await SpecialPowers.spawn(browser, [], () => {});
      EventUtils.synthesizeKey(letter, { type: "keyup" });
      const events = await recordedKeys(browser, key);
      Assert.ok(
        events.every(
          event => event.key === key && event.code === key && event.isTrusted
        ),
        "Only trusted arrows reach the page"
      );
      Assert.equal(events[0].type, "keydown");
      Assert.equal(events.at(-1).type, "keyup");
      Assert.ok(
        events.some(event => event.repeat),
        "Holding the letter repeats the arrow"
      );
      Assert.equal(events.filter(event => event.type === "keyup").length, 1);
      Assert.equal(gModalNavigation.mode, "command");
    }
    await SpecialPowers.spawn(browser, [], () => {
      content.wrappedJSObject.keyEvents.length = 0;
    });
    EventUtils.synthesizeKey("3");
    EventUtils.synthesizeKey("j");
    await SpecialPowers.spawn(browser, [], async () => {
      await ContentTaskUtils.waitForCondition(
        () =>
          content.wrappedJSObject.keyEvents.filter(
            event => event.type === "keyup"
          ).length === 3
      );
      Assert.equal(
        content.scrollY,
        0,
        "Pages can prevent the arrows' default scrolling"
      );
      content.wrappedJSObject.blockKeys = false;
    });
    EventUtils.synthesizeKey("j");
    await SpecialPowers.spawn(browser, [], async () => {
      await ContentTaskUtils.waitForCondition(() => content.scrollY > 0);
      Assert.ok(true, "Uncancelled arrows perform native scrolling");
    });
  });
});

add_task(async function insert_mode_translates_alt_hjkl_to_plain_arrows() {
  await BrowserTestUtils.withNewTab(KEYBOARD_PAGE, async browser => {
    browser.focus();
    gModalNavigation.setMode("insert");
    await SpecialPowers.spawn(browser, [], () => {
      content.wrappedJSObject.blockKeys = true;
      content.document.body.style.height = "5000px";
    });
    for (const [letter, key] of Object.entries({
      h: "ArrowLeft",
      j: "ArrowDown",
      k: "ArrowUp",
      l: "ArrowRight",
    })) {
      await SpecialPowers.spawn(browser, [], () => {
        content.wrappedJSObject.keyEvents.length = 0;
      });
      EventUtils.synthesizeKey(letter, { altKey: true, type: "keydown" });
      await SpecialPowers.spawn(browser, [], () => {});
      EventUtils.synthesizeKey(letter, {
        altKey: true,
        type: "keydown",
        repeat: 2,
      });
      await SpecialPowers.spawn(browser, [], () => {});
      // Alt may be released before the letter.
      EventUtils.synthesizeKey(letter, { type: "keyup" });
      const events = await recordedKeys(browser, key);
      Assert.ok(
        events.every(
          event =>
            event.key === key &&
            event.code === key &&
            event.isTrusted &&
            !event.ctrlKey &&
            !event.shiftKey &&
            !event.altKey &&
            !event.metaKey
        ),
        `${letter} delivers only trusted, unmodified arrows`
      );
      Assert.equal(events[0].type, "keydown");
      Assert.equal(events.at(-1).type, "keyup");
      Assert.ok(events.some(event => event.repeat));
      Assert.equal(events.filter(event => event.type === "keyup").length, 1);
      Assert.equal(gModalNavigation.mode, "insert");
    }
    await SpecialPowers.spawn(browser, [], () => {
      Assert.equal(content.scrollY, 0, "Pages can cancel insert-mode arrows");
    });
  });
});

add_task(async function insert_arrows_move_native_editor_carets() {
  await BrowserTestUtils.withNewTab(KEYBOARD_PAGE, async browser => {
    browser.focus();
    gModalNavigation.setMode("insert");
    for (const tag of ["input", "textarea", "div"]) {
      await SpecialPowers.spawn(browser, [tag], kind => {
        const editor = content.document.createElement(kind);
        editor.id = "caret-editor";
        if (kind === "div") {
          editor.contentEditable = true;
          editor.textContent = "abc def";
        } else {
          editor.value = kind === "textarea" ? "abc def\nabc def" : "abc def";
        }
        content.document.body.append(editor);
        editor.focus();
        if (kind === "div") {
          content.getSelection().collapse(editor.firstChild, 3);
        } else {
          editor.setSelectionRange(3, 3);
        }
      });
      const moves = [
        ["h", 2],
        ["l", 3],
        ...(tag === "textarea"
          ? [
              ["j", 11],
              ["k", 3],
            ]
          : []),
      ];
      for (const [key, position] of moves) {
        await SpecialPowers.spawn(browser, [], () => {
          content.wrappedJSObject.keyEvents.length = 0;
        });
        EventUtils.synthesizeKey(key, { altKey: true });
        await recordedKeys(
          browser,
          { h: "ArrowLeft", l: "ArrowRight", j: "ArrowDown", k: "ArrowUp" }[key]
        );
        await SpecialPowers.spawn(
          browser,
          [tag, position],
          (kind, expected) => {
            const editor = content.document.getElementById("caret-editor");
            Assert.equal(
              kind === "div"
                ? content.getSelection().focusOffset
                : editor.selectionStart,
              expected,
              `Alt shortcut moves the ${kind} caret like a plain arrow`
            );
            Assert.equal(
              kind === "div" ? editor.textContent : editor.value,
              kind === "textarea" ? "abc def\nabc def" : "abc def",
              "The shortcut does not edit the text"
            );
          }
        );
      }
      await SpecialPowers.spawn(browser, [], () => {
        content.document.getElementById("caret-editor").remove();
      });
    }
  });
});

add_task(async function insert_arrows_preserve_other_keys_and_modes() {
  await BrowserTestUtils.withNewTab(KEYBOARD_PAGE, async browser => {
    browser.focus();
    gModalNavigation.setMode("insert");
    await SpecialPowers.spawn(browser, [], () => {
      content.wrappedJSObject.blockKeys = true;
    });
    const preventNativeAlt = event => {
      if (event.altKey) {
        event.preventDefault();
      }
    };
    window.windowRoot.addEventListener("keydown", preventNativeAlt, true);
    try {
      for (const modifiers of [
        {},
        { altKey: true, shiftKey: true },
        { ctrlKey: true, altKey: true },
        { altKey: true, metaKey: true },
        { altKey: true, altGraphKey: true },
      ]) {
        for (const key of ["h", "j", "k", "l"]) {
          await SpecialPowers.spawn(browser, [], () => {
            content.wrappedJSObject.keyEvents.length = 0;
          });
          EventUtils.synthesizeKey(key, modifiers);
          const events = await recordedKeys(browser, key);
          Assert.ok(
            events.some(event => event.key.toLowerCase() === key),
            `${key} with ${JSON.stringify(modifiers)} reaches the page`
          );
          Assert.ok(
            events.every(event => !event.key.startsWith("Arrow")),
            "Other modifier combinations do not produce arrows"
          );
        }
      }
      for (const mode of ["command", "select", "address", "search"]) {
        gModalNavigation.setMode(mode);
        await SpecialPowers.spawn(browser, [], () => {
          content.wrappedJSObject.keyEvents.length = 0;
        });
        for (const key of ["h", "j", "k", "l"]) {
          EventUtils.synthesizeKey(key, { altKey: true });
        }
        Assert.deepEqual(
          await recordedKeys(browser),
          [],
          `${mode} does not send insert-mode arrows`
        );
      }
    } finally {
      window.windowRoot.removeEventListener("keydown", preventNativeAlt, true);
    }
    gModalNavigation.setMode("insert");
    await SpecialPowers.spawn(browser, [], () => {
      content.wrappedJSObject.keyEvents.length = 0;
    });
    EventUtils.synthesizeKey("j", { altKey: true, type: "keydown" });
    await SpecialPowers.spawn(browser, [], async () => {
      await ContentTaskUtils.waitForCondition(() =>
        content.wrappedJSObject.keyEvents.some(
          event => event.key === "ArrowDown"
        )
      );
    });
    gModalNavigation.setMode("command");
    EventUtils.synthesizeKey("j", { type: "keyup" });
    Assert.deepEqual(
      (await recordedKeys(browser, "ArrowDown")).map(event => event.key),
      ["ArrowDown", "ArrowDown"],
      "Changing mode while holding the shortcut still releases its arrow"
    );
  });
});

add_task(async function insert_arrow_tails_do_not_follow_focus() {
  await BrowserTestUtils.withNewTab(KEYBOARD_PAGE, async browser => {
    browser.focus();
    gModalNavigation.setMode("insert");
    EventUtils.synthesizeKey("l", { altKey: true, type: "keydown" });
    await SpecialPowers.spawn(browser, [], async () => {
      await ContentTaskUtils.waitForCondition(() =>
        content.wrappedJSObject.keyEvents.some(
          event => event.key === "ArrowRight"
        )
      );
    });
    gURLBar.focus();
    gURLBar.value = "abc def";
    gURLBar.inputField.setSelectionRange(3, 3);
    EventUtils.synthesizeKey("l", {
      altKey: true,
      type: "keydown",
      repeat: 2,
    });
    EventUtils.synthesizeKey("l", { type: "keyup" });
    await TestUtils.waitForTick();
    Assert.equal(gURLBar.value, "abc def");
    Assert.equal(gURLBar.inputField.selectionStart, 3);
    Assert.equal(gModalNavigation.forwardedKeys.size, 0);
    EventUtils.synthesizeKey("KEY_Escape");
  });
});

add_task(async function insert_arrows_do_not_interrupt_composition() {
  await BrowserTestUtils.withNewTab(KEYBOARD_PAGE, async browser => {
    browser.focus();
    gModalNavigation.setMode("insert");
    await SpecialPowers.spawn(browser, [], () => {
      content.document.getElementById("editor").focus();
    });
    EventUtils.synthesizeComposition({ type: "compositionstart", key: null });
    try {
      for (const key of ["h", "j", "k", "l"]) {
        EventUtils.synthesizeKey(key, { altKey: true });
        const events = await recordedKeys(browser, key);
        Assert.ok(
          events.some(event => event.key === key && event.isComposing),
          "The shortcut reaches the editor during IME composition"
        );
        Assert.ok(events.every(event => !event.key.startsWith("Arrow")));
      }
    } finally {
      EventUtils.synthesizeComposition({
        type: "compositioncommit",
        data: "",
        key: null,
      });
    }
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
    EventUtils.synthesizeKey("t");
    EventUtils.synthesizeKey("u");
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
        await SpecialPowers.spawn(browser, [], () => {
          content.wrappedJSObject.blockKeys = true;
          content.wrappedJSObject.keyEvents.length = 0;
        });
        for (const key of ["h", "j", "k", "l"]) {
          EventUtils.synthesizeKey(key, { altKey: true });
          const events = await recordedKeys(browser, key);
          Assert.ok(
            events.every(event => !event.key.startsWith("Arrow")),
            "Disabling modal navigation restores the original Alt shortcuts"
          );
        }
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
    EventUtils.synthesizeKey("j");
    Assert.deepEqual(
      (await recordedKeys(frame, "ArrowDown")).map(
        event => `${event.type}:${event.key}`
      ),
      ["keydown:ArrowDown", "keyup:ArrowDown"],
      "Translated arrows reach the focused remote frame"
    );
    await SpecialPowers.spawn(frame, [], () => {
      content.wrappedJSObject.keyEvents.length = 0;
    });
    EventUtils.synthesizeKey("i");
    EventUtils.synthesizeKey("x");
    Assert.deepEqual(
      (await recordedKeys(frame, "x")).map(event => event.key),
      ["x", "x", "x"]
    );
    await SpecialPowers.spawn(frame, [], () => {
      content.wrappedJSObject.keyEvents.length = 0;
    });
    EventUtils.synthesizeKey("h", { altKey: true });
    Assert.deepEqual(
      (await recordedKeys(frame, "ArrowLeft")).map(event => event.key),
      ["ArrowLeft", "ArrowLeft"],
      "Insert-mode arrows reach the focused remote frame"
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
