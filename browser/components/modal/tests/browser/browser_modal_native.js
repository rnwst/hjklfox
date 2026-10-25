/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global gModalNavigation */

const { Subprocess } = ChromeUtils.importESModule(
  "resource://gre/modules/Subprocess.sys.mjs"
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

async function xdo(...args) {
  const process = await Subprocess.call({ command: xdotool, arguments: args });
  const output = await process.stdout.readString();
  const { exitCode } = await process.wait();
  Assert.equal(exitCode, 0, `xdotool ${args.join(" ")}`);
  return output.trim();
}

async function focusNativeBrowser(browser) {
  const ids = await xdo(
    "search",
    "--all",
    "--onlyvisible",
    "--pid",
    String(Services.appinfo.processID),
    "--name",
    "Modal native keyboard test"
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
    } finally {
      window.removeEventListener("command", onCommand, true);
    }
  });
});
