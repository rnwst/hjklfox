/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global gModalNavigation */

const BUTTON_PAGE =
  "https://example.com/browser/browser/components/modal/tests/browser/buttons.html";

async function showHints(browser, newTab = false) {
  browser.focus();
  EventUtils.synthesizeKey("g");
  EventUtils.synthesizeKey(newTab ? "W" : "w", { shiftKey: newTab });
  await TestUtils.waitForCondition(
    () => gModalNavigation.hints?.targets.length > 0
  );
  return SpecialPowers.spawn(browser, [], async () => {
    const actor = content.windowGlobalChild.getActor("Modal");
    await ContentTaskUtils.waitForCondition(() => actor.overlay);
    return Array.from(actor.overlay.root.querySelectorAll(".hint"), label => ({
      id: actor.targets[Number(label.dataset.index)].id,
      label: label.dataset.label,
      name: label.textContent,
    }));
  });
}

add_task(async function buttons_are_hint_targets() {
  await BrowserTestUtils.withNewTab(BUTTON_PAGE, async browser => {
    const hints = await showHints(browser);
    Assert.deepEqual(
      hints.map(hint => hint.id),
      ["action", "submit", "unnamed", "first", "second"],
      "Only enabled, visible, non-inert targets receive hints"
    );
    Assert.ok(
      hints.find(hint => hint.id === "unnamed").name.includes("Button"),
      "Unnamed buttons have a localized fallback description"
    );
    EventUtils.synthesizeKey(hints.find(hint => hint.id === "action").label);
    await SpecialPowers.spawn(browser, [], async () => {
      await ContentTaskUtils.waitForCondition(
        () => content.document.body.dataset.clicks === "1"
      );
      Assert.equal(
        content.document.body.dataset.trusted,
        "true",
        "Hint activation dispatches a trusted click"
      );
      Assert.equal(
        content.document.body.dataset.activation,
        "true",
        "Hint activation supplies a user gesture for button actions"
      );
    });
    const formHints = await showHints(browser);
    EventUtils.synthesizeKey(
      formHints.find(hint => hint.id === "submit").label
    );
    await SpecialPowers.spawn(browser, [], async () => {
      await ContentTaskUtils.waitForCondition(
        () => content.document.body.dataset.submits === "1"
      );
      Assert.ok(true, "Submit buttons keep their native form action");
    });
  });
});

add_task(async function unmatched_hint_keys_cancel_and_allow_reentry() {
  for (const newTab of [false, true]) {
    await BrowserTestUtils.withNewTab(BUTTON_PAGE, async browser => {
      await showHints(browser, newTab);
      EventUtils.synthesizeKey("z");
      Assert.equal(
        gModalNavigation.hints,
        null,
        "An unmatched hint key exits hint mode"
      );
      Assert.equal(gModalNavigation.mode, "command");
      await SpecialPowers.spawn(browser, [], async () => {
        const actor = content.windowGlobalChild.getActor("Modal");
        await ContentTaskUtils.waitForCondition(() => !actor.overlay);
        Assert.equal(
          content.document.body.dataset.clicks,
          "0",
          "Cancelling does not activate a target"
        );
      });
      const hints = await showHints(browser, newTab);
      Assert.greater(
        hints.length,
        0,
        "Hint mode can be entered again without Escape"
      );
      EventUtils.synthesizeKey("KEY_Escape");
    });
  }
});

add_task(async function partial_hint_labels_remain_correctable() {
  await BrowserTestUtils.withNewTab(BUTTON_PAGE, async browser => {
    await SpecialPowers.spawn(browser, [], () => {
      const grid = content.document.createElement("div");
      grid.style.cssText =
        "position:fixed;top:8px;left:8px;display:grid;grid-template-columns:repeat(5,60px);gap:4px";
      for (let i = 0; i < 20; i++) {
        const link = content.document.createElement("a");
        link.id = `target-${i}`;
        link.href = `#target-${i}`;
        link.textContent = `Link ${i}`;
        grid.append(link);
      }
      content.document.body.replaceChildren(grid);
    });
    const hints = await showHints(browser);
    Assert.equal(hints.length, 20);
    Assert.ok(hints.every(hint => hint.label.length === 2));
    const session = gModalNavigation.hints;
    const prefix = hints[0].label[0];
    EventUtils.synthesizeKey(prefix);
    Assert.equal(
      gModalNavigation.hints,
      session,
      "A valid partial label keeps hint mode active"
    );
    await SpecialPowers.spawn(browser, [prefix], async expected => {
      const actor = content.windowGlobalChild.getActor("Modal");
      await ContentTaskUtils.waitForCondition(() => actor.prefix === expected);
      Assert.ok(
        [...actor.overlay.root.querySelectorAll(".hint")]
          .filter(label => !label.hidden)
          .every(label => label.dataset.label.startsWith(expected))
      );
    });
    EventUtils.synthesizeKey("KEY_Backspace");
    Assert.equal(gModalNavigation.hints.prefix, "");
    EventUtils.synthesizeKey(hints.at(-1).label[0]);
    EventUtils.synthesizeKey("l");
    Assert.equal(
      gModalNavigation.hints,
      null,
      "An impossible combination of hint-alphabet letters also cancels"
    );
    await showHints(browser);
    const loaded = BrowserTestUtils.waitForLocationChange(
      gBrowser,
      `${BUTTON_PAGE}#target-0`
    );
    EventUtils.sendString(gModalNavigation.hints.targets[0].label);
    await loaded;
    Assert.equal(
      gModalNavigation.hints,
      null,
      "A valid full label still activates its target"
    );
  });
});

add_task(async function early_hint_input_waits_for_collection() {
  for (const key of ["a", "z"]) {
    await BrowserTestUtils.withNewTab(BUTTON_PAGE, async browser => {
      browser.focus();
      const collecting = gModalNavigation.startHints();
      EventUtils.synthesizeKey(key);
      Assert.ok(
        gModalNavigation.hints,
        "Input is buffered until hint labels are known"
      );
      await collecting;
      Assert.equal(
        gModalNavigation.hints,
        null,
        "Buffered input activates or cancels once collection finishes"
      );
      await SpecialPowers.spawn(
        browser,
        [key === "a" ? "1" : "0"],
        async clicks => {
          const actor = content.windowGlobalChild.getActor("Modal");
          await ContentTaskUtils.waitForCondition(
            () =>
              !actor.overlay && content.document.body.dataset.clicks === clicks
          );
          Assert.equal(content.document.body.dataset.clicks, clicks);
        }
      );
    });
  }
});

add_task(async function new_tab_hints_use_native_link_activation() {
  for (const background of [true, false]) {
    await SpecialPowers.pushPrefEnv({
      set: [["browser.tabs.loadInBackground", background]],
    });
    try {
      await BrowserTestUtils.withNewTab(BUTTON_PAGE, async browser => {
        const original = gBrowser.selectedTab;
        await SpecialPowers.spawn(browser, [], () => {
          content.document
            .getElementById("first")
            .addEventListener("auxclick", event => {
              content.document.body.dataset.auxclick = JSON.stringify({
                button: event.button,
                trusted: event.isTrusted,
                activation: content.navigator.userActivation.isActive,
              });
            });
        });
        const hints = await showHints(browser, true);
        Assert.deepEqual(
          hints.map(hint => hint.id),
          ["first", "second"],
          "New-tab hints label only links"
        );
        const opened = BrowserTestUtils.waitForNewTab(
          gBrowser,
          `${BUTTON_PAGE}#one`
        );
        EventUtils.sendString(hints.find(hint => hint.id === "first").label);
        const tab = await opened;
        try {
          if (!background) {
            await TestUtils.waitForCondition(
              () => gBrowser.selectedTab === tab
            );
          }
          Assert.equal(
            gBrowser.selectedTab,
            background ? original : tab,
            "New-tab hints respect the tab-selection preference"
          );
          Assert.equal(
            browser.currentURI.spec,
            BUTTON_PAGE,
            "The source tab does not navigate"
          );
          Assert.equal(gModalNavigation.hints, null);
          await SpecialPowers.spawn(browser, [], () => {
            Assert.deepEqual(
              JSON.parse(content.document.body.dataset.auxclick),
              {
                button: 1,
                trusted: true,
                activation: true,
              },
              "The link receives a trusted native middle-click with user activation"
            );
          });
        } finally {
          BrowserTestUtils.removeTab(tab);
        }
      });
    } finally {
      await SpecialPowers.popPrefEnv();
    }
  }
});

add_task(async function new_tab_hints_preserve_cancellation() {
  await BrowserTestUtils.withNewTab(BUTTON_PAGE, async browser => {
    const tabCount = gBrowser.tabs.length;
    await SpecialPowers.spawn(browser, [], () => {
      content.document
        .getElementById("first")
        .addEventListener("auxclick", event => {
          event.preventDefault();
          content.document.body.dataset.cancelled = "true";
        });
    });
    const hints = await showHints(browser, true);
    EventUtils.sendString(hints.find(hint => hint.id === "first").label);
    await SpecialPowers.spawn(browser, [], async () => {
      await ContentTaskUtils.waitForCondition(
        () => content.document.body.dataset.cancelled === "true"
      );
    });
    Assert.equal(
      gBrowser.tabs.length,
      tabCount,
      "Page cancellation prevents opening a tab"
    );
    await showHints(browser, true);
    EventUtils.synthesizeKey("KEY_Escape");
    Assert.equal(gModalNavigation.hints, null);
    const normal = await showHints(browser);
    Assert.ok(
      normal.some(hint => hint.id === "action"),
      "Normal hints still include buttons after leaving new-tab mode"
    );
    EventUtils.synthesizeKey("KEY_Escape");
  });
});

add_task(async function new_tab_hints_cover_remote_frames() {
  const frameURL = BUTTON_PAGE.replace("example.com", "example.org").replace(
    "buttons.html",
    "page.html"
  );
  await BrowserTestUtils.withNewTab(BUTTON_PAGE, async browser => {
    await SpecialPowers.spawn(browser, [frameURL], async url => {
      const frame = content.document.createElement("iframe");
      frame.style.cssText =
        "position:fixed;left:400px;top:0;width:300px;height:250px";
      frame.src = url;
      const loaded = ContentTaskUtils.waitForEvent(frame, "load");
      content.document.body.append(frame);
      await loaded;
    });
    await showHints(browser, true);
    const label = await SpecialPowers.spawn(
      browser.browsingContext.children[0],
      [],
      async () => {
        const actor = content.windowGlobalChild.getActor("Modal");
        await ContentTaskUtils.waitForCondition(() => actor.overlay);
        return actor.overlay.root.querySelector(".hint").dataset.label;
      }
    );
    const opened = BrowserTestUtils.waitForNewTab(gBrowser, `${frameURL}#one`);
    EventUtils.sendString(label);
    const tab = await opened;
    try {
      Assert.equal(browser.currentURI.spec, BUTTON_PAGE);
      Assert.equal(
        tab.linkedBrowser.currentURI.spec,
        `${frameURL}#one`,
        "A remote frame's hint opens its own link destination"
      );
    } finally {
      BrowserTestUtils.removeTab(tab);
    }
  });
});

add_task(async function newly_disabled_buttons_are_not_activated() {
  await BrowserTestUtils.withNewTab(BUTTON_PAGE, async browser => {
    const hints = await showHints(browser);
    await SpecialPowers.spawn(browser, [], () => {
      content.document.getElementById("action").disabled = true;
    });
    EventUtils.synthesizeKey(hints.find(hint => hint.id === "action").label);
    await SpecialPowers.spawn(browser, [], () => {
      Assert.equal(
        content.document.body.dataset.clicks,
        "0",
        "Disabled state is checked again at activation"
      );
    });
  });
});

add_task(async function replacement_buttons_keep_their_hint() {
  await BrowserTestUtils.withNewTab(BUTTON_PAGE, async browser => {
    const hints = await showHints(browser);
    await SpecialPowers.spawn(browser, [], async () => {
      const original = content.document.getElementById("action");
      const replacement = original.cloneNode(true);
      replacement.textContent = "Replacement action";
      replacement.addEventListener("click", () => {
        content.document.body.dataset.clicks = "1";
      });
      original.replaceWith(replacement);
      const actor = content.windowGlobalChild.getActor("Modal");
      await ContentTaskUtils.waitForCondition(
        () => actor.targets[0] === replacement
      );
      Assert.ok(
        actor.overlay.root
          .querySelector('.hint[data-index="0"]')
          .textContent.includes("Replacement action"),
        "Hint descriptions follow button updates"
      );
    });
    EventUtils.synthesizeKey(hints.find(hint => hint.id === "action").label);
    await SpecialPowers.spawn(browser, [], async () => {
      await ContentTaskUtils.waitForCondition(
        () => content.document.body.dataset.clicks === "1"
      );
      Assert.ok(true, "The original label activates the replacement button");
    });
  });
});

add_task(async function modified_commands_stay_modal_during_hints() {
  await BrowserTestUtils.withNewTab(BUTTON_PAGE, async browser => {
    await showHints(browser);
    const session = gModalNavigation.hints;
    EventUtils.synthesizeKey("d", { ctrlKey: true });
    await SpecialPowers.spawn(browser, [], async () => {
      await ContentTaskUtils.waitForCondition(() => content.scrollY > 0);
    });
    Assert.equal(
      gModalNavigation.hints,
      session,
      "Ctrl-d scrolls without opening bookmarks or dismissing hints"
    );
    EventUtils.synthesizeKey("o", { ctrlKey: true });
    Assert.equal(
      gModalNavigation.hints,
      null,
      "History commands leave hint selection instead of falling through to Open File"
    );
  });
});

add_task(async function simplified_browser_chrome() {
  Assert.equal(document.getElementById("focusURLBar"), null);
  Assert.equal(document.getElementById("focusURLBar2"), null);
  Assert.equal(
    Services.prefs
      .getDefaultBranch("")
      .getBoolPref("browser.translations.automaticallyPopup"),
    false
  );
  for (const id of [
    "sidebar-container",
    "sidebar-box",
    "sidebar-button",
    "alltabs-button",
    "viewSidebarMenuMenu",
  ]) {
    const element = document.getElementById(id);
    Assert.ok(
      !element ||
        element.hidden ||
        getComputedStyle(element).display === "none",
      `${id} is removed from the visible chrome`
    );
  }
  await BrowserTestUtils.withNewTab(BUTTON_PAGE, async browser => {
    browser.focus();
    for (const modifiers of [{ ctrlKey: true }, { altKey: true }]) {
      EventUtils.synthesizeKey(modifiers.ctrlKey ? "l" : "d", modifiers);
      await SpecialPowers.spawn(browser, [], () => {});
      Assert.equal(
        document.activeElement,
        browser,
        "Retired shortcuts do not focus the URL bar"
      );
    }
    EventUtils.synthesizeKey(" ");
    EventUtils.synthesizeKey("f");
    await TestUtils.waitForCondition(
      () => document.activeElement === gURLBar.inputField
    );
    Assert.equal(gModalNavigation.urlbar.mode, "destinations");
    EventUtils.synthesizeKey("KEY_Escape");
    await TestUtils.waitForCondition(() => document.activeElement === browser);
  });
});

add_task(async function saved_vertical_layout_returns_to_visible_tabs() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["sidebar.revamp", true],
      ["sidebar.verticalTabs", true],
    ],
  });
  let win;
  try {
    win = await BrowserTestUtils.openNewBrowserWindow();
    await win.SidebarController.promiseInitialized;
    await TestUtils.waitForCondition(
      () => !Services.prefs.getBoolPref("sidebar.verticalTabs")
    );
    await win.SidebarController.waitUntilStable();
    Assert.ok(
      !win.gBrowser.tabContainer.verticalMode,
      "A saved vertical layout becomes horizontal"
    );
    Assert.ok(
      !win.SidebarController.isOpen,
      "Restored sidebar content is closed"
    );
    Assert.greater(
      win.gBrowser.tabContainer.getBoundingClientRect().width,
      0,
      "Removing the sidebar does not hide the tab strip"
    );
  } finally {
    if (win) {
      await BrowserTestUtils.closeWindow(win);
    }
    await SpecialPowers.popPrefEnv();
    await SimpleTest.promiseFocus(window);
  }
});
