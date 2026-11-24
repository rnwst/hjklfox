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
    this.resetHistory();
  }

  resetHistory(tab = null) {
    this.history = tab ? [tab] : [];
    this.historyIndex = this.history.length - 1;
    this.historyTab = tab;
    this.historyTarget = null;
  }

  recordSelection(tab) {
    if (tab === this.historyTarget || tab === this.historyTab) {
      return;
    }
    this.historyTab = tab;
    this.history.length = this.historyIndex + 1;
    if (this.history.at(-1) !== tab) {
      this.history.push(tab);
    }
    this.historyIndex = this.history.length - 1;
  }

  forgetTab(tab) {
    let removedBeforeCursor = 0;
    this.history = this.history.filter((entry, index) => {
      if (entry !== tab) {
        return true;
      }
      if (index <= this.historyIndex) {
        removedBeforeCursor++;
      }
      return false;
    });
    this.historyIndex -= removedBeforeCursor;
    if (this.historyTab === tab) {
      this.historyTab = null;
    }
  }

  traverseHistory(direction, count) {
    const eligible = new Set(this.window.gBrowser.nonHiddenTabs);
    let destination = this.historyIndex;
    let tab = this.window.gBrowser.selectedTab;
    for (
      let index = destination + direction;
      index >= 0 && index < this.history.length && count;
      index += direction
    ) {
      const candidate = this.history[index];
      if (!eligible.has(candidate) || candidate === tab) {
        continue;
      }
      destination = index;
      tab = candidate;
      count--;
    }
    if (destination === this.historyIndex) {
      return;
    }
    const previousIndex = this.historyIndex;
    const previousTab = this.historyTab;
    this.historyIndex = destination;
    this.historyTab = tab;
    this.historyTarget = tab;
    try {
      if (!this.activate(tab)) {
        this.historyIndex = previousIndex;
        this.historyTab = previousTab;
      }
    } finally {
      this.historyTarget = null;
    }
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
    this.moveSelection(direction, count, withinGroup);
  }

  moveSelection(direction, count, withinGroup, edge = false) {
    const browser = this.window.gBrowser;
    const selected = [...browser.selectedTabs];
    const active = browser.selectedTab;
    const partitions = new Map();
    for (const tab of selected) {
      const key = withinGroup ? tab.group : tab.pinned;
      if (withinGroup && !key) {
        continue;
      }
      if (!partitions.has(key)) {
        partitions.set(key, []);
      }
      partitions.get(key).push(tab);
    }
    for (const [key, tabs] of partitions) {
      this.moveBlock(tabs, direction, count, withinGroup, edge, key);
    }
    if (browser.selectedTab !== active) {
      browser.selectedTab = active;
    }
    this.replaceSelection(selected);
  }

  moveBlock(tabs, direction, count, withinGroup, edge, partition) {
    const browser = this.window.gBrowser;
    const selected = new Set(tabs);
    const groups = new Set(
      tabs
        .map(tab => tab.group)
        .filter(group => group?.tabs.every(tab => selected.has(tab)))
    );
    let elements = this.groupingElements(tabs);
    if (!withinGroup) {
      elements = [
        ...new Set(
          elements.map(element =>
            groups.has(element.group) ? element.group : element
          )
        ),
      ];
    }
    const moving = new Set(elements);
    const sourceGroups = new Set(tabs.map(tab => tab.group).filter(Boolean));
    const eligible = browser.nonHiddenTabs.filter(tab =>
      withinGroup ? tab.group === partition : tab.pinned === partition
    );
    const stops = [
      ...new Set(
        eligible.map(tab => {
          if (
            !withinGroup &&
            tab.group &&
            (edge ||
              groups.size ||
              sourceGroups.has(tab.group) ||
              tab.group.collapsed)
          ) {
            return tab.group;
          }
          return tab.splitview || tab;
        })
      ),
    ];
    const remaining = stops.filter(stop => !moving.has(stop));
    if (withinGroup) {
      if (!remaining.length) {
        return;
      }
      const anchor = direction > 0 ? elements.at(-1) : elements[0];
      const index = stops.indexOf(anchor);
      const slot = stops
        .slice(0, index)
        .filter(stop => !moving.has(stop)).length;
      const slots = remaining.length + 1;
      const endpoint = direction > 0 ? remaining.length : 0;
      const destination = edge
        ? endpoint
        : (((slot + direction * count) % slots) + slots) % slots;
      if (destination === remaining.length) {
        browser.moveTabsAfter(elements, remaining.at(-1));
      } else {
        browser.moveTabsBefore(elements, remaining[destination]);
      }
      return;
    }
    const anchorTab = direction > 0 ? tabs.at(-1) : tabs[0];
    const anchor =
      anchorTab.group && sourceGroups.has(anchorTab.group)
        ? anchorTab.group
        : anchorTab.splitview || anchorTab;
    const index = stops.indexOf(anchor);
    let candidates =
      direction > 0 ? stops.slice(index) : stops.slice(0, index + 1).reverse();
    candidates = candidates.filter(stop => !moving.has(stop));
    const endpoint = direction > 0 ? remaining.at(-1) : remaining[0];
    const target = edge
      ? endpoint
      : candidates[Math.min(count, candidates.length) - 1];
    if (target) {
      browser[direction > 0 ? "moveTabsAfter" : "moveTabsBefore"](
        elements,
        target
      );
    } else {
      // At a boundary, still close gaps without moving the leading element.
      const pivot = direction > 0 ? elements.pop() : elements.shift();
      if (elements.length) {
        browser[direction > 0 ? "moveTabsBefore" : "moveTabsAfter"](
          elements,
          pivot
        );
      }
    }
  }

  edge(direction, move = false, withinGroup = false) {
    if (move) {
      this.moveSelection(direction, 1, withinGroup, true);
      return;
    }
    const tabs = this.navigationStops(withinGroup);
    const target = direction > 0 ? tabs.at(-1) : tabs[0];
    if (!target) {
      return;
    }
    this.activate(target);
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
