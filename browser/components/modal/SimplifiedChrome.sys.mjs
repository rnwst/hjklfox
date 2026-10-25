/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export function configureSimplifiedChrome(win) {
  win.SidebarController.promiseInitialized
    .then(() => {
      if (win.closed) {
        return;
      }
      // Saved vertical layouts need a horizontal strip when sidebar chrome is absent.
      if (win.SidebarController.sidebarVerticalTabsEnabled) {
        win.SidebarController.toggleVerticalTabs();
      }
      win.SidebarController.hide();
    })
    .catch(console.error);
}
