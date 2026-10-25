/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  UrlbarProvider,
  UrlbarUtils,
} from "moz-src:///browser/components/urlbar/UrlbarUtils.sys.mjs";
import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";
import {
  fuzzyScore,
  fuzzySqlPattern,
} from "moz-src:///browser/components/modal/FuzzySearch.sys.mjs";
import { ensureDefaultEngines } from "moz-src:///browser/components/modal/ModalEngines.sys.mjs";
import {
  ADDRESS_BINDINGS,
  keyToken,
} from "moz-src:///browser/components/modal/Keymap.sys.mjs";

const lazy = XPCOMUtils.declareLazy({
  SearchService: "moz-src:///toolkit/components/search/SearchService.sys.mjs",
  PlacesUtils: "resource://gre/modules/PlacesUtils.sys.mjs",
  PrivateBrowsingUtils: "resource://gre/modules/PrivateBrowsingUtils.sys.mjs",
  BrowserWindowTracker: "resource:///modules/BrowserWindowTracker.sys.mjs",
  ProvidersManager:
    "moz-src:///browser/components/urlbar/UrlbarProvidersManager.sys.mjs",
  UrlbarResult: "chrome://browser/content/urlbar/UrlbarResult.mjs",
  UrlbarShared: "chrome://browser/content/urlbar/UrlbarShared.mjs",
});

const states = new WeakMap();
let registered = false;
const LOCAL_MODES = new Set(["destinations", "history", "bookmarks", "tabs"]);

function isAddress(value) {
  return /^(?:https?:\/\/|file:\/\/|about:|localhost(?::\d+)?(?:\/|$)|[^\s/@]+\.[^\s/@]+(?:[/:]|$))/i.test(
    value.trim()
  );
}

function setQueryValue(bar, value) {
  bar.setValue(value, { valueIsTyped: true });
  bar.userTypedValue = value;
  bar.setPageProxyState("invalid", true);
  bar.toggleAttribute("usertyping", !!value);
}

/** Adapt the native URL bar rather than maintaining a second navigation UI. */
export class ModalUrlbar {
  constructor(win) {
    this.window = win;
    this.mode = null;
    this.version = 0;
    states.set(win.gURLBar, this);
    if (!registered) {
      lazy.ProvidersManager.getInstanceForSap("urlbar").registerProvider(
        new ModalLocalProvider()
      );
      registered = true;
    }
    this.ready = ensureDefaultEngines();
    this.ready.catch(console.error);
    win.gURLBar.addEventListener("searchmodechanged", this);
  }

  handleEvent() {
    const mode = this.window.gURLBar.searchMode;
    if (mode?.engineName && this.mode === "engines" && !mode.isPreview) {
      this.pickEngine(mode.engineName).catch(console.error);
      return;
    }
    if (mode?.engineName && this.mode !== "engines") {
      this.mode = null;
      this.describe();
    }
  }

  async open(mode) {
    if (mode === "edit") {
      this.edit();
      return;
    }
    const version = ++this.version;
    this.resumeContext = null;
    const bar = this.window.gURLBar;
    this.mode = mode === "search" ? null : mode;
    bar.focus();
    setQueryValue(bar, "");
    if (mode === "search") {
      await this.ready;
    }
    if (version !== this.version) {
      return;
    }
    const source = {
      history: lazy.UrlbarShared.RESULT_SOURCE.HISTORY,
      bookmarks: lazy.UrlbarShared.RESULT_SOURCE.BOOKMARKS,
      tabs: lazy.UrlbarShared.RESULT_SOURCE.TABS,
    }[mode];
    let searchMode = null;
    if (mode === "search") {
      searchMode = {
        engineName: (await lazy.SearchService.getDefault()).name,
        entry: "shortcut",
        isPreview: false,
      };
    } else if (source) {
      searchMode = { source, entry: "shortcut", isPreview: false };
    }
    if (version !== this.version) {
      return;
    }
    await bar.setSearchMode(searchMode, this.window.gBrowser.selectedBrowser);
    if (version !== this.version) {
      return;
    }
    bar.startQuery({ allowAutofill: false });
    this.describe();
  }

  edit() {
    const bar = this.window.gURLBar;
    this.version++;
    if (!bar.value) {
      bar.handleRevert();
    }
    const resume = this.resumeContext;
    this.mode =
      resume?.browser === this.window.gBrowser.selectedBrowser &&
      resume.value === bar.untrimmedValue
        ? resume.mode
        : null;
    this.resumeContext = null;
    bar.focus();
    bar.setValue(bar.untrimmedValue, { valueIsTyped: bar.valueIsTyped });
    bar.setSelectionRange(bar.value.length, bar.value.length);
    this.describe();
  }

  async exit() {
    const version = ++this.version;
    const bar = this.window.gURLBar;
    const browser = this.window.gBrowser.selectedBrowser;
    bar.controller.cancelQuery();
    bar.view.close();
    if (this.mode === "engines") {
      const query = this.savedQuery || "";
      this.mode = this.savedMode;
      await bar.setSearchMode(this.savedSearchMode, browser);
      if (
        version !== this.version ||
        browser !== this.window.gBrowser.selectedBrowser ||
        !bar.focused
      ) {
        return false;
      }
      setQueryValue(bar, query);
    }
    if (version !== this.version || !bar.focused) {
      return false;
    }
    if (!bar.value) {
      bar.handleRevert();
      this.mode = null;
    }
    this.resumeContext = {
      browser,
      value: bar.untrimmedValue,
      mode: this.mode,
    };
    this.mode = null;
    this.savedQuery = null;
    this.savedMode = null;
    this.savedSearchMode = null;
    this.describe();
    bar.controller.cancelQuery();
    bar.view.close();
    return true;
  }

  describe() {
    const field = this.window.gURLBar.inputField;
    if (!this.mode) {
      if (
        this.description &&
        field.getAttribute("aria-description") === this.description
      ) {
        if (this.previousDescription === null) {
          field.removeAttribute("aria-description");
        } else {
          field.setAttribute("aria-description", this.previousDescription);
        }
      }
      this.description = null;
      return;
    }
    const mode = this.mode;
    this.window.document.l10n.formatValue(`modal-urlbar-${mode}`).then(text => {
      if (this.mode === mode) {
        if (field.getAttribute("aria-description") !== this.description) {
          this.previousDescription = field.getAttribute("aria-description");
        }
        this.description = text;
        field.setAttribute("aria-description", text);
      }
    });
  }

  async pickEngine(engineName) {
    const version = ++this.version;
    const browser = this.window.gBrowser.selectedBrowser;
    const bar = this.window.gURLBar;
    const query = this.savedQuery || "";
    this.mode = null;
    this.savedQuery = null;
    await bar.setSearchMode(
      { engineName, entry: "shortcut", isPreview: false },
      browser
    );
    if (
      version !== this.version ||
      browser !== this.window.gBrowser.selectedBrowser ||
      !bar.focused
    ) {
      return;
    }
    bar.search(query);
    this.describe();
  }

  async showEngines() {
    const version = ++this.version;
    await this.ready;
    const bar = this.window.gURLBar;
    if (version !== this.version || !bar.focused) {
      return;
    }
    this.savedQuery = bar.value;
    this.savedMode = this.mode;
    this.savedSearchMode = bar.searchMode;
    this.mode = "engines";
    await bar.setSearchMode(null, this.window.gBrowser.selectedBrowser);
    if (version !== this.version) {
      return;
    }
    bar.search("");
    this.describe();
  }

  async cancelEngines() {
    const version = ++this.version;
    const bar = this.window.gURLBar;
    const query = this.savedQuery || "";
    this.mode = this.savedMode;
    await bar.setSearchMode(
      this.savedSearchMode,
      this.window.gBrowser.selectedBrowser
    );
    if (version !== this.version || !bar.focused) {
      return;
    }
    bar.search(query);
    this.savedQuery = null;
    this.describe();
  }

  handleKey(event) {
    const bar = this.window.gURLBar;
    if (!bar.contains(event.target) && !bar.focused) {
      return false;
    }
    const command = !event.shiftKey && ADDRESS_BINDINGS[keyToken(event)];
    if (command === "address.next" || command === "address.previous") {
      this.select(command === "address.previous").catch(console.error);
      return true;
    }
    if (command === "address.engines") {
      if (this.mode === "engines") {
        this.cancelEngines().catch(console.error);
      } else {
        this.showEngines().catch(console.error);
      }
      return true;
    }
    if (this.mode === "engines") {
      if (event.key === "Enter") {
        const result = bar.view.selectedResult || bar.view.getResultAtIndex(0);
        if (result?.providerName === "ModalLocal") {
          this.pickEngine(result.payload.engine).catch(console.error);
        }
        return true;
      }
    }
    if (
      LOCAL_MODES.has(this.mode) &&
      event.key === "Enter" &&
      !isAddress(bar.value) &&
      !bar.value.trimStart().startsWith("@")
    ) {
      this.acceptLocal(event).catch(console.error);
      return true;
    }
    return false;
  }

  async acceptLocal(event) {
    const bar = this.window.gURLBar;
    const version = this.version;
    const value = bar.value;
    await bar.lastQueryContextPromise;
    if (
      version !== this.version ||
      !LOCAL_MODES.has(this.mode) ||
      value !== bar.value ||
      !bar.focused
    ) {
      return;
    }
    const result = bar.view.selectedResult || bar.view.getResultAtIndex(0);
    if (result?.providerName === "ModalLocal") {
      bar.pickResult({ result, event });
    }
  }

  async select(reverse) {
    const bar = this.window.gURLBar;
    const version = this.version;
    if (!bar.view.isOpen) {
      bar.startQuery({ allowAutofill: false });
      await bar.lastQueryContextPromise;
    }
    if (version === this.version && bar.focused && bar.view.isOpen) {
      bar.view.selectBy(1, { reverse });
    }
  }

  reset() {
    this.version++;
    this.mode = null;
    this.savedQuery = null;
    this.resumeContext = null;
    this.describe();
  }

  destroy() {
    this.reset();
    this.window.gURLBar.removeEventListener("searchmodechanged", this);
    states.delete(this.window.gURLBar);
  }
}

/** Local-only, high-priority results while an explicit modal picker is active. */
class ModalLocalProvider extends UrlbarProvider {
  get name() {
    return "ModalLocal";
  }
  get type() {
    return lazy.UrlbarShared.PROVIDER_TYPE.PROFILE;
  }
  getPriority() {
    return 10;
  }

  async isActive(context, controller) {
    const state = states.get(controller.input);
    return (
      !!state?.window.gModalNavigation?.enabled &&
      (state.mode === "engines" ||
        (LOCAL_MODES.has(state.mode) &&
          !context.searchString.trimStart().startsWith("@") &&
          !isAddress(context.searchString)))
    );
  }

  async startQuery(context, add, controller) {
    const state = states.get(controller.input);
    if (!state) {
      return;
    }
    const instance = this.queryInstance;
    const mode = state.mode;
    const version = state.version;
    const valid = () =>
      instance === this.queryInstance &&
      version === state.version &&
      mode === state.mode;
    if (mode === "engines") {
      const engines = await lazy.SearchService.getVisibleEngines();
      if (!valid()) {
        return;
      }
      for (const engine of engines) {
        if (
          fuzzyScore(context.searchString, [engine.name, ...engine.aliases]) ===
          null
        ) {
          continue;
        }
        add(
          this,
          new lazy.UrlbarResult({
            type: lazy.UrlbarShared.RESULT_TYPE.SEARCH,
            source: lazy.UrlbarShared.RESULT_SOURCE.SEARCH,
            payload: {
              engine: engine.name,
              keyword:
                engine.aliases.find(alias => alias.startsWith("@")) || "",
              query: "",
              providesSearchMode: true,
            },
          })
        );
      }
      return;
    }
    const candidates =
      mode === "tabs"
        ? this.tabs(state.window)
        : await this.places(context.searchString, mode);
    if (!valid()) {
      return;
    }
    const ranked = candidates
      .map(item => ({
        ...item,
        score: fuzzyScore(context.searchString, [
          item.title,
          item.url,
          item.tags,
          item.pageTitle,
        ]),
      }))
      .filter(item => item.score !== null)
      .sort(
        (a, b) =>
          b.score - a.score ||
          b.frecency - a.frecency ||
          a.url.localeCompare(b.url)
      );
    for (const [index, item] of ranked.slice(0, context.maxResults).entries()) {
      let source = lazy.UrlbarShared.RESULT_SOURCE.HISTORY;
      if (mode === "tabs") {
        source = lazy.UrlbarShared.RESULT_SOURCE.TABS;
      } else if (item.bookmarked && mode !== "history") {
        source = lazy.UrlbarShared.RESULT_SOURCE.BOOKMARKS;
      }
      add(
        this,
        new lazy.UrlbarResult({
          type:
            mode === "tabs"
              ? lazy.UrlbarShared.RESULT_TYPE.TAB_SWITCH
              : lazy.UrlbarShared.RESULT_TYPE.URL,
          source,
          heuristic: mode === "destinations" && index === 0,
          suggestedIndex: index,
          payload: {
            url: item.url,
            title: item.title || item.url,
            ...(mode === "tabs"
              ? {
                  userContext: UrlbarUtils.getUserContextData(
                    item.userContextId
                  ),
                }
              : {}),
          },
        })
      );
    }
  }

  tabs(win) {
    const privateWindow = lazy.PrivateBrowsingUtils.isWindowPrivate(win);
    const userContextId =
      win.gBrowser.selectedBrowser.contentPrincipal.originAttributes
        .userContextId;
    const results = [];
    for (const other of lazy.BrowserWindowTracker.orderedWindows) {
      if (lazy.PrivateBrowsingUtils.isWindowPrivate(other) !== privateWindow) {
        continue;
      }
      for (const tab of other.gBrowser.visibleTabs) {
        if (
          (other === win && tab === win.gBrowser.selectedTab) ||
          Number(tab.getAttribute("usercontextid") || 0) !== userContextId
        ) {
          continue;
        }
        results.push({
          title: tab.label,
          url: tab.linkedBrowser.currentURI.spec,
          userContextId,
          frecency: tab.lastAccessed || 0,
        });
      }
    }
    return results;
  }

  async places(query, mode) {
    const db = await lazy.PlacesUtils.promiseDBConnection();
    const tokens = query
      .toLowerCase()
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 8);
    const params = { tagsGuid: lazy.PlacesUtils.bookmarks.tagsGuid };
    const restriction = {
      history: "visits > 0",
      bookmarks: "bookmarkId IS NOT NULL",
      destinations: "(visits > 0 OR bookmarkId IS NOT NULL)",
    }[mode];
    const filters = tokens.map((token, index) => {
      params[`q${index}`] = fuzzySqlPattern(token);
      return `LOWER(url || ' ' || IFNULL(title, '') || ' ' || IFNULL(pageTitle, '') || ' ' || IFNULL(tags, '')) LIKE :q${index} ESCAPE '\\'`;
    });
    const rows = await db.executeCached(
      `
      WITH candidates AS (
        SELECT h.url, h.title AS pageTitle, h.frecency,
          (SELECT b.id FROM moz_bookmarks b WHERE b.fk = h.id AND b.type = 1
            AND b.parent NOT IN (SELECT id FROM moz_bookmarks WHERE parent = (SELECT id FROM moz_bookmarks WHERE guid = :tagsGuid))
            ORDER BY b.lastModified DESC LIMIT 1) AS bookmarkId,
          (SELECT GROUP_CONCAT(t.title, ' ') FROM moz_bookmarks b JOIN moz_bookmarks t ON t.id = b.parent
            WHERE b.fk = h.id AND t.parent = (SELECT id FROM moz_bookmarks WHERE guid = :tagsGuid)) AS tags,
          h.visit_count AS visits
        FROM moz_places h WHERE h.hidden = 0
      ), named AS (
        SELECT *, (SELECT title FROM moz_bookmarks WHERE id = bookmarkId) AS title FROM candidates
      )
      SELECT url, IFNULL(NULLIF(title, ''), pageTitle) AS displayTitle, pageTitle, tags, frecency, bookmarkId IS NOT NULL AS bookmarked
      FROM named
      WHERE ${restriction}
      ${filters.length ? `AND ${filters.join(" AND ")}` : ""}
      ORDER BY frecency DESC LIMIT 1000`,
      params
    );
    return rows.map(row => ({
      url: row.getResultByName("url"),
      title: row.getResultByName("displayTitle"),
      pageTitle: row.getResultByName("pageTitle"),
      tags: row.getResultByName("tags"),
      frecency: row.getResultByName("frecency"),
      bookmarked: !!row.getResultByName("bookmarked"),
    }));
  }
}
