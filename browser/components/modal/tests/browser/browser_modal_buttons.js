/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global gModalNavigation */

const BUTTON_PAGE =
  "https://example.com/browser/browser/components/modal/tests/browser/buttons.html";

async function showHints(browser) {
  browser.focus();
  EventUtils.synthesizeKey("g");
  EventUtils.synthesizeKey("w");
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
