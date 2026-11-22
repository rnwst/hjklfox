/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

function groupRepresentative(group, tabs = group.tabs) {
  return tabs.reduce((latest, tab) => {
    if (tab.selected) {
      return tab;
    }
    return !latest ||
      (!latest.selected && tab.lastSeenActive > latest.lastSeenActive)
      ? tab
      : latest;
  }, null);
}

/** Native tab operations with two-level modal navigation. */
export class ModalTabs {
  constructor(win) {
    this.window = win;
  }

  startSelection() {
    const browser = this.window.gBrowser;
    this.selectionAnchor = browser.selectedTab;
    this.replaceSelection([browser.selectedTab]);
    this.setSelectionCursor(browser.selectedTab);
    this.window.gModalNavigation.setMode("select");
  }

  setSelectionCursor(tab) {
    this.selectionCursor?.removeAttribute("modal-selection-cursor");
    this.selectionCursor = tab;
    tab?.setAttribute("modal-selection-cursor", "true");
    if (!tab) {
      this.selectionAnchor = null;
    }
  }

  replaceSelection(tabs) {
    const browser = this.window.gBrowser;
    const selected = new Set(tabs);
    const previous = browser.selectedTabs;
    const splits = new Set(
      [...previous, ...tabs].map(tab => tab.splitview).filter(Boolean)
    );
    for (const tab of previous) {
      if (!selected.has(tab)) {
        browser.removeFromMultiSelectedTabs(tab);
      }
    }
    for (const tab of tabs) {
      browser.addToMultiSelectedTabs(tab);
    }
    // Native per-tab selection marks the wrapper even for a partial selection.
    for (const split of splits) {
      if (split.tabs.every(tab => tab.multiselected)) {
        split.setAttribute("multiselected", "true");
        split.setAttribute("aria-selected", "true");
      } else {
        split.removeAttribute("multiselected");
        split.removeAttribute("aria-selected");
      }
    }
  }

  extendSelection(direction, count, edge = false) {
    const browser = this.window.gBrowser;
    const tabs = browser.nonHiddenTabs;
    let index = tabs.indexOf(this.selectionCursor);
    if (index < 0) {
      index = tabs.indexOf(browser.selectedTab);
    }
    if (index < 0) {
      return;
    }
    let anchor = tabs.indexOf(this.selectionAnchor);
    if (anchor < 0) {
      this.selectionAnchor = browser.selectedTab;
      anchor = tabs.indexOf(this.selectionAnchor);
    }
    if (anchor < 0) {
      return;
    }
    let destination = Math.max(
      0,
      Math.min(tabs.length - 1, index + direction * count)
    );
    if (edge) {
      destination = direction > 0 ? tabs.length - 1 : 0;
    }
    const selected = tabs.slice(
      Math.min(anchor, destination),
      Math.max(anchor, destination) + 1
    );
    for (const tab of selected) {
      if (tab.group?.collapsed) {
        tab.group.collapsed = false;
      }
    }
    this.replaceSelection(selected);
    this.setSelectionCursor(tabs[destination]);
    this.window.gModalNavigation.updateIndicator();
  }

  groupableTabs() {
    return this.window.gBrowser.selectedTabs.filter(tab => !tab.pinned);
  }

  groupingElements(tabs) {
    const selected = new Set(tabs);
    const splits = new Set(tabs.map(tab => tab.splitview).filter(Boolean));
    for (const split of splits) {
      const members = split.tabs;
      if (!members.every(tab => selected.has(tab))) {
        const group = split.group;
        const collapsed = group?.collapsed;
        split.unsplitTabs("keyboard_shortcut");
        const displaced = members.filter(
          tab => tab.isOpen && tab.group !== group
        );
        if (group?.isConnected && displaced.length) {
          group.addTabs(displaced);
          group.collapsed = collapsed;
        }
      }
    }
    return [
      ...new Set(
        tabs.filter(tab => tab.isOpen).map(tab => tab.splitview || tab)
      ),
    ];
  }

  activate(tab) {
    const win = tab?.documentGlobal;
    if (!win || win.closed || !win.gBrowser.nonHiddenTabs.includes(tab)) {
      return false;
    }
    win.gBrowser.selectedTab = tab;
    win.focus();
    win.gModalNavigation?.enterCommand();
    return true;
  }

  navigationStops(withinGroup = false) {
    const browser = this.window.gBrowser;
    const current = browser.selectedTab;
    let tabs = browser.nonHiddenTabs;
    if (withinGroup) {
      if (!current.group) {
        return [];
      }
      tabs = tabs.filter(tab => tab.group === current.group);
    } else {
      const representatives = new Map();
      const eligible = new Set(tabs);
      for (const tab of tabs) {
        if (tab.group?.collapsed && !representatives.has(tab.group)) {
          representatives.set(
            tab.group,
            groupRepresentative(
              tab.group,
              tab.group.tabs.filter(t => eligible.has(t))
            )
          );
        }
      }
      tabs = tabs.filter(
        tab => !tab.group?.collapsed || representatives.get(tab.group) === tab
      );
    }
    return tabs;
  }

  cycle(direction, count, withinGroup = false) {
    const tabs = this.navigationStops(withinGroup);
    const index = tabs.indexOf(this.window.gBrowser.selectedTab);
    if (index >= 0 && tabs.length) {
      this.activate(
        tabs[
          (((index + direction * count) % tabs.length) + tabs.length) %
            tabs.length
        ]
      );
    }
  }

  move(direction, count, withinGroup = false) {
    const browser = this.window.gBrowser;
    const current = browser.selectedTab;
    const tabs = this.navigationStops(withinGroup);
    const index = tabs.indexOf(current);
    if (index < 0) {
      return;
    }
    const offset = index + direction * count;
    const destination = withinGroup
      ? ((offset % tabs.length) + tabs.length) % tabs.length
      : Math.max(0, Math.min(tabs.length - 1, offset));
    let target = tabs[destination];
    if (target === current) {
      if (withinGroup || !current.group) {
        return;
      }
      // A group at the strip edge can still release its first or last tab.
      target = current.group;
    } else if (!withinGroup && target.group?.collapsed) {
      target = target.group;
    } else {
      target = target.splitview || target;
    }
    const element = current.splitview || current;
    if (element !== target) {
      const after = withinGroup ? destination > index : direction > 0;
      browser[after ? "moveTabAfter" : "moveTabBefore"](element, target);
    }
  }

  edge(direction, move = false, withinGroup = false) {
    const browser = this.window.gBrowser;
    const current = browser.selectedTab;
    const tabs =
      move && !withinGroup
        ? browser.nonHiddenTabs.filter(tab => tab.pinned === current.pinned)
        : this.navigationStops(withinGroup);
    let target = direction > 0 ? tabs.at(-1) : tabs[0];
    if (!target) {
      return;
    }
    if (!move) {
      this.activate(target);
      return;
    }
    target = (!withinGroup && target.group) || target.splitview || target;
    const element = current.splitview || current;
    if (element !== target) {
      browser[direction > 0 ? "moveTabAfter" : "moveTabBefore"](
        element,
        target
      );
    }
  }

  execute(action) {
    const browser = this.window.gBrowser;
    const tab = browser.selectedTab;
    switch (action) {
      case "new":
      case "move":
        if (this.groupableTabs().length) {
          if (action === "new") {
            const elements = this.groupingElements(this.groupableTabs());
            if (!elements.length) {
              break;
            }
            const anchor = elements.includes(tab.splitview || tab)
              ? tab.splitview || tab
              : elements[0];
            browser.addTabGroup(elements, {
              insertBefore: anchor.group || anchor,
              metricsContext: browser.TabMetrics.userTriggeredContext(
                browser.TabMetrics.METRIC_SOURCE.KEYBOARD
              ),
            });
          } else {
            this.window.gModalNavigation.urlbar
              .open("group-move")
              .catch(console.error);
          }
        } else {
          const navigation = this.window.gModalNavigation;
          this.window.document.l10n.setAttributes(
            navigation.indicator,
            "modal-group-pinned"
          );
        }
        break;
      case "ungroup":
        for (const element of this.groupingElements(
          browser.selectedTabs.filter(t => t.group)
        )) {
          if (element.localName === "tab-split-view-wrapper") {
            browser.ungroupSplitView(element);
          } else {
            browser.ungroupTab(element);
          }
        }
        break;
      case "select":
        if (tab.group) {
          tab.group.collapsed = false;
          this.replaceSelection(
            browser.nonHiddenTabs.filter(t => t.group === tab.group)
          );
        }
        break;
      case "fold":
      case "unfold":
        if (tab.group) {
          tab.group.collapsed = action === "fold";
        }
        break;
      case "edit":
        if (tab.group) {
          browser.tabGroupMenu.openEditModal(tab.group);
        }
        break;
    }
  }
}
