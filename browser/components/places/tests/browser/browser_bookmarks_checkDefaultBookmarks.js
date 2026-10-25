/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const PREF_RESTORE_DEFAULT_BOOKMARKS =
  "browser.bookmarks.restore_default_bookmarks";

async function simulatePlacesInit() {
  const { PlacesBrowserStartup } = ChromeUtils.importESModule(
    "moz-src:///browser/components/places/PlacesBrowserStartup.sys.mjs"
  );
  const complete = TestUtils.topicObserved("places-browser-init-complete");
  PlacesBrowserStartup._placesInitialized = false;
  PlacesBrowserStartup.initPlaces();
  await complete;
}

add_task(async function checkDefaultBookmarks() {
  await PlacesUtils.bookmarks.eraseEverything();
  await PlacesUtils.bookmarks.insert({
    parentGuid: PlacesUtils.bookmarks.menuGuid,
    title: "Restore test marker",
    url: "https://example.com/restore-test",
  });
  await SpecialPowers.pushPrefEnv({
    set: [
      [PREF_RESTORE_DEFAULT_BOOKMARKS, true],
      ["browser.bookmarks.testing.skipDefaultBookmarksImport", false],
    ],
  });
  try {
    await simulatePlacesInit();
    Assert.ok(!Services.prefs.getBoolPref(PREF_RESTORE_DEFAULT_BOOKMARKS));
    for (const parentGuid of [
      PlacesUtils.bookmarks.menuGuid,
      PlacesUtils.bookmarks.toolbarGuid,
      PlacesUtils.bookmarks.unfiledGuid,
    ]) {
      Assert.ok(
        !(await PlacesUtils.bookmarks.fetch({ parentGuid, index: 0 })),
        "The default bookmark seed adds no bookmarks or folders"
      );
    }
  } finally {
    await SpecialPowers.popPrefEnv();
    await PlacesUtils.bookmarks.eraseEverything();
  }
});
