/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global gModalNavigation */

const EDITOR_PAGE =
  "https://example.com/browser/browser/components/modal/tests/browser/editors.html";

async function editorHints(browser, context = browser, newTab = false) {
  browser.focus();
  await gModalNavigation.startHints(newTab);
  return SpecialPowers.spawn(context, [], async () => {
    const actor = content.windowGlobalChild.getActor("Modal");
    await ContentTaskUtils.waitForCondition(() => actor.overlay);
    return Array.from(actor.overlay.root.querySelectorAll(".hint"), hint => ({
      id: actor.targets[Number(hint.dataset.index)].id,
      label: hint.dataset.label,
      name: hint.textContent,
    }));
  });
}

add_task(async function only_editable_fields_receive_hints() {
  await BrowserTestUtils.withNewTab(EDITOR_PAGE, async browser => {
    const hints = await editorHints(browser);
    Assert.deepEqual(
      hints.map(hint => hint.id),
      [
        "link",
        "button",
        "text",
        "search",
        "password",
        "textarea",
        "rich",
        "empty",
        "plain",
        "outer",
        "nested",
      ],
      "Hints include editing hosts, but not readonly or non-editable controls"
    );
    for (const [id, description] of [
      ["text", "Name"],
      ["search", "Search"],
      ["textarea", "Notes"],
      ["password", "Editable field"],
      ["rich", "Editable field"],
    ]) {
      Assert.ok(hints.find(hint => hint.id === id).name.endsWith(description));
    }
    Assert.ok(
      hints.every(hint => !/secret-password|Private draft/.test(hint.name))
    );
    EventUtils.synthesizeKey("KEY_Escape");
    const links = await editorHints(browser, browser, true);
    Assert.deepEqual(
      links.map(hint => hint.id),
      ["link"]
    );
    EventUtils.synthesizeKey("KEY_Escape");
  });
});

async function activateEditor(browser, context, id) {
  const hints = await editorHints(browser, context);
  EventUtils.sendString(hints.find(hint => hint.id === id).label);
  await TestUtils.waitForCondition(() => gModalNavigation.mode === "insert");
  await SpecialPowers.spawn(context, [id], async targetId => {
    const actor = content.windowGlobalChild.getActor("Modal");
    await ContentTaskUtils.waitForCondition(
      () => actor.insertMode && !actor.overlay
    );
    const editor = content.document.getElementById(targetId);
    Assert.equal(
      content.document.activeElement,
      editor,
      "The editor has focus"
    );
    Assert.equal(
      editor.value ?? editor.textContent,
      "",
      "Hint keys do not enter the editor"
    );
  });
  EventUtils.sendString("hello");
  await SpecialPowers.spawn(context, [id], async targetId => {
    const editor = content.document.getElementById(targetId);
    await ContentTaskUtils.waitForCondition(
      () => (editor.value ?? editor.textContent) === "hello"
    );
  });
  EventUtils.synthesizeKey("KEY_Escape");
  await TestUtils.waitForCondition(() => gModalNavigation.mode === "command");
  EventUtils.synthesizeKey("i");
  await TestUtils.waitForCondition(() => gModalNavigation.mode === "insert");
  await SpecialPowers.spawn(context, [id], async targetId => {
    await ContentTaskUtils.waitForCondition(
      () => content.document.activeElement.id === targetId
    );
  });
  EventUtils.synthesizeKey("KEY_Escape");
}

add_task(async function hints_focus_editors_and_allow_typing() {
  await BrowserTestUtils.withNewTab(EDITOR_PAGE, async browser => {
    for (const id of ["text", "textarea", "empty", "plain", "rich", "nested"]) {
      await SpecialPowers.spawn(browser, [id], targetId => {
        const editor = content.document.getElementById(targetId);
        if (editor.isContentEditable) {
          editor.textContent = "";
        }
      });
      await activateEditor(browser, browser, id);
    }
  });
});

add_task(async function changed_editors_cannot_be_activated() {
  for (const [id, attribute, value] of [
    ["text", "readonly", ""],
    ["textarea", "disabled", ""],
    ["rich", "contenteditable", "false"],
  ]) {
    await BrowserTestUtils.withNewTab(EDITOR_PAGE, async browser => {
      const hints = await editorHints(browser);
      const selected = hints.find(hint => hint.id === id);
      await SpecialPowers.spawn(
        browser,
        [id, attribute, value],
        async (targetId, attr, val) => {
          const actor = content.windowGlobalChild.getActor("Modal");
          const editor = content.document.getElementById(targetId);
          editor.addEventListener("mousedown", () => {
            content.document.body.dataset.activated = "true";
          });
          editor.setAttribute(attr, val);
          const index = actor.targets.indexOf(editor);
          await ContentTaskUtils.waitForCondition(
            () =>
              actor.overlay.root.querySelector(`.hint[data-index="${index}"]`)
                .hidden
          );
        }
      );
      EventUtils.sendString(selected.label);
      await SpecialPowers.spawn(browser, [], () => {
        Assert.ok(
          !content.document.body.dataset.activated,
          "Ineligible editors are not clicked"
        );
      });
      Assert.equal(gModalNavigation.mode, "command");
    });
  }
});

add_task(async function replacement_editors_keep_their_hint() {
  await BrowserTestUtils.withNewTab(EDITOR_PAGE, async browser => {
    const hints = await editorHints(browser);
    await SpecialPowers.spawn(browser, [], async () => {
      const actor = content.windowGlobalChild.getActor("Modal");
      const original = content.document.getElementById("text");
      const replacement = original.cloneNode();
      original.replaceWith(replacement);
      await ContentTaskUtils.waitForCondition(() =>
        actor.targets.includes(replacement)
      );
    });
    EventUtils.sendString(hints.find(hint => hint.id === "text").label);
    await TestUtils.waitForCondition(() => gModalNavigation.mode === "insert");
    await SpecialPowers.spawn(browser, [], () => {
      Assert.equal(content.document.activeElement.id, "text");
    });
    EventUtils.synthesizeKey("KEY_Escape");
  });
});

add_task(async function remote_frame_editors_allow_typing() {
  await BrowserTestUtils.withNewTab(EDITOR_PAGE, async browser => {
    await SpecialPowers.spawn(
      browser,
      [EDITOR_PAGE.replace("example.com", "example.org")],
      async url => {
        const frame = content.document.createElement("iframe");
        frame.style.cssText = "position:fixed;inset:0;width:650px;height:400px";
        frame.src = url;
        const loaded = ContentTaskUtils.waitForEvent(frame, "load");
        content.document.body.replaceChildren(frame);
        await loaded;
      }
    );
    await activateEditor(browser, browser.browsingContext.children[0], "text");
  });
});
