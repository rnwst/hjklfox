/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global gModalNavigation */

function completionPanel() {
  return document.getElementById("modal-key-completions");
}

async function openPrefix(key) {
  EventUtils.synthesizeKey(key);
  await TestUtils.waitForCondition(() =>
    completionPanel()?.matches(":popover-open")
  );
  return completionPanel();
}

async function closed() {
  await TestUtils.waitForCondition(
    () => !completionPanel()?.matches(":popover-open")
  );
}

add_task(async function prefixes_show_available_keys_without_taking_focus() {
  await BrowserTestUtils.withNewTab("about:blank", async browser => {
    browser.focus();
    const panel = await openPrefix(" ");
    Assert.equal(
      document.activeElement,
      browser,
      "The guide does not take focus"
    );
    Assert.deepEqual(
      [...panel.querySelectorAll("[data-keys]")].map(row => row.dataset.keys),
      ["f", "e", "h", "m", "b", "s"]
    );
    Assert.ok(
      [...panel.querySelectorAll("dd")].every(node => node.textContent)
    );
    const bounds = panel.getBoundingClientRect();
    const toolbar = document.getElementById("nav-bar").getBoundingClientRect();
    Assert.greater(
      toolbar.right - bounds.right,
      4,
      "Completions are inset from the right edge"
    );
    Assert.greater(
      bounds.top - toolbar.bottom,
      4,
      "Completions are offset into the page"
    );
    Assert.less(
      Math.abs(bounds.right - toolbar.right),
      40,
      "Completions align with the right edge"
    );
    Assert.less(
      Math.abs(bounds.top - toolbar.bottom),
      40,
      "Completions open below the toolbar"
    );
    EventUtils.synthesizeKey("f");
    await closed();
    await TestUtils.waitForCondition(() => gURLBar.focused);
    Assert.equal(gModalNavigation.urlbar.mode, "destinations");
    EventUtils.synthesizeKey("KEY_Escape");
    await TestUtils.waitForCondition(() => document.activeElement === browser);

    await openPrefix("g");
    Assert.ok(
      panel.querySelector('[data-keys="w"]'),
      "Go-prefix includes link hints"
    );
    EventUtils.synthesizeKey("KEY_Escape");
    await closed();
    Assert.equal(gModalNavigation.keymap.prefix, "");
    Assert.equal(gModalNavigation.mode, "command");

    await openPrefix(" ");
    EventUtils.synthesizeKey("z");
    await closed();
    Assert.equal(
      gModalNavigation.keymap.prefix,
      "",
      "An unmatched key cancels the prefix"
    );
  });
});

add_task(async function custom_nested_sequences_and_mode_changes() {
  await SpecialPowers.pushPrefEnv({
    set: [
      [
        "browser.modal.keybindings",
        JSON.stringify({
          "Space f": null,
          "Space q t": "urlbar.tabs",
        }),
      ],
    ],
  });
  try {
    await BrowserTestUtils.withNewTab("about:blank", async browser => {
      browser.focus();
      const panel = await openPrefix(" ");
      Assert.ok(!panel.querySelector('[data-keys="f"]'));
      Assert.ok(panel.querySelector('[data-keys="q t"]'));
      EventUtils.synthesizeKey("q");
      await TestUtils.waitForCondition(() =>
        panel.querySelector('[data-keys="t"]')
      );
      Assert.equal(panel.querySelectorAll("[data-keys]").length, 1);
      EventUtils.synthesizeKey("t");
      await closed();
      await TestUtils.waitForCondition(() => gURLBar.focused);
      Assert.equal(gModalNavigation.urlbar.mode, "tabs");
      EventUtils.synthesizeKey("KEY_Escape");
      await TestUtils.waitForCondition(
        () => document.activeElement === browser
      );

      await openPrefix(" ");
      gURLBar.focus();
      await closed();
      Assert.equal(gModalNavigation.keymap.prefix, "");
      EventUtils.synthesizeKey("KEY_Escape");
      await TestUtils.waitForCondition(
        () => document.activeElement === browser
      );

      await openPrefix(" ");
      await SpecialPowers.pushPrefEnv({
        set: [["browser.modal.enabled", false]],
      });
      try {
        await closed();
      } finally {
        await SpecialPowers.popPrefEnv();
      }
    });
  } finally {
    await SpecialPowers.popPrefEnv();
  }
});

add_task(async function tab_switch_dismisses_prefix() {
  await BrowserTestUtils.withNewTab("about:blank", async browser => {
    browser.focus();
    await openPrefix(" ");
    await BrowserTestUtils.withNewTab("about:blank", async () => {
      await closed();
      Assert.equal(gModalNavigation.keymap.prefix, "");
    });
  });
});

add_task(async function tooltips_do_not_cancel_the_pending_sequence() {
  await BrowserTestUtils.withNewTab("about:blank", async browser => {
    browser.focus();
    const panel = await openPrefix(" ");
    const tooltip = document.createXULElement("tooltip");
    tooltip.setAttribute("label", "Delayed toolbar tooltip");
    document.getElementById("mainPopupSet").append(tooltip);
    try {
      const shown = BrowserTestUtils.waitForEvent(tooltip, "popupshown");
      tooltip.openPopup(document.getElementById("nav-bar"), "after_start");
      await shown;
      Assert.equal(
        gModalNavigation.keymap.prefix,
        "Space",
        "A tooltip preserves the prefix"
      );
      Assert.ok(
        panel.matches(":popover-open"),
        "A tooltip leaves shortcut help visible"
      );
    } finally {
      tooltip.hidePopup();
      tooltip.remove();
      EventUtils.synthesizeKey("KEY_Escape");
      await closed();
    }
  });
});

add_task(async function backdrop_blurs_the_page_beneath_the_help() {
  await BrowserTestUtils.withNewTab(
    "https://example.com/browser/browser/components/modal/tests/browser/page.html",
    async browser => {
      await SpecialPowers.spawn(browser, [], async () => {
        content.document.body.replaceChildren();
        content.document.documentElement.style.background =
          "repeating-linear-gradient(90deg, black 0px 4px, white 4px 8px)";
        await new Promise(resolve =>
          content.requestAnimationFrame(() =>
            content.requestAnimationFrame(resolve)
          )
        );
      });
      browser.focus();
      const panel = await openPrefix(" ");
      await SpecialPowers.spawn(browser, [], async () => {
        const actor = content.windowGlobalChild.getActor("Modal");
        await ContentTaskUtils.waitForCondition(() => {
          const backdrop = actor.keyBackdrop?.root.querySelector(
            ".modal-key-backdrop"
          );
          return (
            backdrop &&
            content.getComputedStyle(backdrop).backdropFilter !== "none"
          );
        });
      });
      const bounds = panel.getBoundingClientRect();
      const rect = new DOMRect(bounds.left + 20, bounds.top + 6, 64, 1);
      const canvas = document.createElementNS(
        "http://www.w3.org/1999/xhtml",
        "canvas"
      );
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      const context = canvas.getContext("2d");
      const contrast = async () => {
        await new Promise(resolve =>
          window.requestAnimationFrame(() =>
            window.requestAnimationFrame(resolve)
          )
        );
        // Compositor readback is needed: drawSnapshot omits backdrop filters.
        context.drawWindow(
          window,
          0,
          0,
          canvas.width,
          canvas.height,
          "white",
          context.DRAWWINDOW_DRAW_CARET |
            context.DRAWWINDOW_DRAW_VIEW |
            context.DRAWWINDOW_USE_WIDGET_LAYERS
        );
        const pixels = context.getImageData(
          rect.x,
          rect.y,
          rect.width,
          rect.height
        ).data;
        const red = Array.from({ length: rect.width }, (_, i) => pixels[i * 4]);
        return Math.max(...red) - Math.min(...red);
      };
      try {
        const blurred = await contrast();
        panel.style.backdropFilter = "none";
        gModalNavigation.keyPopup.clearBackdrop();
        await SpecialPowers.spawn(browser, [], async () => {
          await ContentTaskUtils.waitForCondition(
            () => !content.windowGlobalChild.getActor("Modal").keyBackdrop
          );
        });
        const sharp = await contrast();
        Assert.greater(
          sharp,
          10,
          "The translucent background reveals the page stripes"
        );
        Assert.less(
          blurred,
          sharp / 2,
          "Backdrop blur smooths page pixels behind the help"
        );
        gModalNavigation.keyPopup.updateBackdrop();
        await SpecialPowers.spawn(browser, [], async () => {
          await ContentTaskUtils.waitForCondition(
            () => content.windowGlobalChild.getActor("Modal").keyBackdrop
          );
          Assert.ok(
            !content.document.querySelector(".modal-key-backdrop"),
            "The blur layer is outside the page DOM"
          );
        });
      } finally {
        panel.style.removeProperty("backdrop-filter");
        EventUtils.synthesizeKey("KEY_Escape");
        await closed();
        await SpecialPowers.spawn(browser, [], async () => {
          await ContentTaskUtils.waitForCondition(
            () => !content.windowGlobalChild.getActor("Modal").keyBackdrop
          );
        });
      }
    }
  );
});

add_task(async function cancelled_translation_cannot_reopen_popup() {
  await BrowserTestUtils.withNewTab("about:blank", async browser => {
    browser.focus();
    const original = document.l10n.translateFragment;
    const deferred = Promise.withResolvers();
    document.l10n.translateFragment = () => deferred.promise;
    try {
      EventUtils.synthesizeKey(" ");
      EventUtils.synthesizeKey("KEY_Escape");
      deferred.resolve();
      await TestUtils.waitForTick();
      Assert.ok(!completionPanel().matches(":popover-open"));
      Assert.equal(gModalNavigation.keymap.prefix, "");
    } finally {
      document.l10n.translateFragment = original;
      deferred.resolve();
    }
  });
});
