/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global gModalNavigation */

const { DEFAULT_BINDINGS } = ChromeUtils.importESModule(
  "moz-src:///browser/components/modal/Keymap.sys.mjs"
);

add_setup(async function setup() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.newtabpage.enabled", false],
      ["browser.modal.keybindings", "{}"],
    ],
  });
});

add_task(async function guide_covers_current_commands() {
  const commands = [...new Set(Object.values(DEFAULT_BINDINGS))];
  const ids = commands.map(
    command => `modal-shortcut-${command.replaceAll(".", "-")}`
  );
  const l10n = new Localization(["browser/modal.ftl"]);
  const messages = await l10n.formatMessages(ids.map(id => ({ id })));
  for (const [index, message] of messages.entries()) {
    Assert.ok(message?.value, `${commands[index]} has a guide description`);
  }
  const homepage = Services.prefs
    .getDefaultBranch("")
    .getStringPref("browser.startup.homepage");
  Assert.equal(
    homepage,
    "about:newtab",
    "Startup opens the shortcut reference by default"
  );
  await BrowserTestUtils.withNewTab(homepage, async browser => {
    await SpecialPowers.spawn(browser, [DEFAULT_BINDINGS], async bindings => {
      const doc = content.document;
      await ContentTaskUtils.waitForCondition(() =>
        doc.getElementById("modal-shortcuts")
      );
      Assert.ok(doc.querySelector("main h1").textContent);
      await ContentTaskUtils.waitForCondition(
        () =>
          content.getComputedStyle(doc.querySelector("dl > div")).display ===
          "grid",
        "The guide stylesheet loads under the new-tab content policy"
      );
      Assert.equal(
        content.getComputedStyle(doc.querySelector("dl")).display,
        "block"
      );
      Assert.equal(doc.querySelectorAll("main section h2").length, 6);
      const descriptions = [...doc.querySelectorAll("dd")];
      const edge = doc.documentElement.dir === "rtl" ? "right" : "left";
      const alignedEdge = descriptions[0].getBoundingClientRect()[edge];
      Assert.ok(
        descriptions.every(
          description =>
            description.getBoundingClientRect()[edge] === alignedEdge
        ),
        "Shortcut explanations align across all groups"
      );
      Assert.ok(
        doc.querySelector('[data-group="navigation"] [data-command="tab.next"]')
      );
      Assert.ok(
        doc.querySelector(
          '[data-group="navigation"] [data-command="history.back"]'
        )
      );
      for (const [keys, command] of Object.entries(bindings)) {
        const row = doc.querySelector(`[data-command="${command}"]`);
        Assert.ok(row, `${command} is included`);
        Assert.ok(
          [...row.querySelectorAll("kbd")].some(
            key => key.dataset.keys === keys
          ),
          `${keys} is shown for ${command}`
        );
      }
      Assert.equal(doc.querySelectorAll("input, button, a, iframe").length, 0);
    });
    gURLBar.focus();
    EventUtils.synthesizeKey("KEY_Escape");
    await TestUtils.waitForCondition(() => document.activeElement === browser);
    Assert.equal(gModalNavigation.mode, "command");
    EventUtils.synthesizeKey(" ");
    EventUtils.synthesizeKey("f");
    await TestUtils.waitForCondition(() => gURLBar.focused);
    Assert.equal(gModalNavigation.urlbar.mode, "destinations");
    EventUtils.synthesizeKey("KEY_Escape");
    await TestUtils.waitForCondition(() => document.activeElement === browser);
  });
});

add_task(async function guide_tracks_live_overrides_and_disabling() {
  await BrowserTestUtils.withNewTab("about:newtab", async browser => {
    await SpecialPowers.pushPrefEnv({
      set: [
        [
          "browser.modal.keybindings",
          JSON.stringify({ j: null, z: "scroll.down", "g t": "tab.next" }),
        ],
      ],
    });
    try {
      await SpecialPowers.spawn(browser, [], async () => {
        const doc = content.document;
        await ContentTaskUtils.waitForCondition(() =>
          doc.querySelector('[data-keys="z"]')
        );
        Assert.ok(!doc.querySelector('[data-keys="j"]'));
        Assert.ok(doc.querySelector('[data-keys="g t"]'));
        Assert.equal(
          doc.querySelector('[data-command="scroll.page-up"] kbd').textContent,
          "Ctrl+b"
        );
      });
    } finally {
      await SpecialPowers.popPrefEnv();
    }
    await SpecialPowers.spawn(browser, [], async () => {
      await ContentTaskUtils.waitForCondition(() =>
        content.document.querySelector('[data-keys="j"]')
      );
      Assert.ok(!content.document.querySelector('[data-keys="z"]'));
    });
    await SpecialPowers.pushPrefEnv({
      set: [["browser.modal.enabled", false]],
    });
    try {
      await SpecialPowers.spawn(browser, [], async () => {
        await ContentTaskUtils.waitForCondition(
          () => !content.document.getElementById("modal-shortcuts")
        );
        Assert.equal(content.document.body.textContent.trim(), "");
      });
    } finally {
      await SpecialPowers.popPrefEnv();
    }
    await SpecialPowers.spawn(browser, [], async () => {
      await ContentTaskUtils.waitForCondition(() =>
        content.document.getElementById("modal-shortcuts")
      );
    });
  });
});

add_task(async function blank_pages_remain_blank() {
  await BrowserTestUtils.withNewTab("about:blank", async browser => {
    await SpecialPowers.spawn(browser, [], () => {
      Assert.equal(content.document.body.textContent, "");
      Assert.ok(!content.document.getElementById("modal-shortcuts"));
    });
  });
});
