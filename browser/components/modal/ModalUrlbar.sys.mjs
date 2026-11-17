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
  UrlbarSearchUtils:
    "moz-src:///browser/components/urlbar/UrlbarSearchUtils.sys.mjs",
});

const states = new WeakMap();
let registered = false;
const LOCAL_MODES = new Set(["history", "bookmarks", "tabs"]);
const ENGINE_ALIAS_QUERY = /^\s*@(?:\s*|\S+)$/u;

function isEngineAliasQuery(context) {
  return (
    context &&
    !context.restrictInSearchMode() &&
    ENGINE_ALIAS_QUERY.test(context.searchString)
  );
}

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
    this.inputRevision = 0;
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
    win.gURLBar.inputField.addEventListener("input", this);
    win.gURLBar.view.panel.addEventListener("mousedown", this);
  }

  handleEvent(event) {
    if (event.type === "input") {
      this.inputRevision++;
      if (this.mode === "engines") {
        this.savedQuery = this.window.gURLBar.value;
      }
      if (this.window.gModalNavigation?.enabled && !event.isComposing) {
        this.completeEngineAlias().catch(console.error);
      }
      return;
    }
    if (event.type === "mousedown") {
      if (
        this.window.gModalNavigation?.enabled &&
        event.button === 0 &&
        event.target.closest(".urlbarView-row")
      ) {
        event.preventDefault();
      }
      return;
    }
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
    this.savedQuery = null;
    this.savedMode = null;
    this.savedSearchMode = null;
    const bar = this.window.gURLBar;
    bar.focus();
    this.mode = mode === "search" ? null : mode;
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
    this.ensureDefaultMode();
    bar.setValue(bar.untrimmedValue, { valueIsTyped: bar.valueIsTyped });
    bar.setSelectionRange(bar.value.length, bar.value.length);
    this.describe();
  }

  ensureDefaultMode() {
    const bar = this.window.gURLBar;
    if (this.mode || bar.searchMode?.engineName) {
      return;
    }
    this.mode =
      {
        [lazy.UrlbarShared.RESULT_SOURCE.HISTORY]: "history",
        [lazy.UrlbarShared.RESULT_SOURCE.BOOKMARKS]: "bookmarks",
        [lazy.UrlbarShared.RESULT_SOURCE.TABS]: "tabs",
      }[bar.searchMode?.source] || "destinations";
    this.describe();
  }

  configureQuery(context) {
    if (this.mode === "engines") {
      context.providers = ["ModalLocal"];
      context.sources = [lazy.UrlbarShared.RESULT_SOURCE.SEARCH];
      context.maxResults = Math.max(context.maxResults, this.engineCount);
    } else if (
      LOCAL_MODES.has(this.mode) &&
      !isAddress(context.searchString) &&
      !context.searchString.trimStart().startsWith("@")
    ) {
      // Keep local pickers local without excluding native inline completion.
      context.providers = ["UrlbarProviderAutofill", "ModalLocal"];
    }
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
    this.savedMode = null;
    this.savedSearchMode = null;
    bar.controller.cancelQuery();
    bar.view.close();
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
    const engines = await lazy.SearchService.getVisibleEngines();
    const bar = this.window.gURLBar;
    if (version !== this.version || !bar.focused) {
      return;
    }
    if (ENGINE_ALIAS_QUERY.test(bar.value)) {
      const context = await bar.lastQueryContextPromise;
      if (version !== this.version || !bar.focused) {
        return;
      }
      if (context?.searchString === bar.value && isEngineAliasQuery(context)) {
        bar.startQuery({ allowAutofill: false });
        return;
      }
    }
    this.savedQuery = bar.value;
    this.savedMode = this.mode;
    this.savedSearchMode = bar.searchMode;
    this.engineCount = engines.length;
    this.mode = "engines";
    bar.startQuery({ allowAutofill: false });
    this.describe();
  }

  async cancelEngines() {
    const version = ++this.version;
    const inputRevision = this.inputRevision;
    const bar = this.window.gURLBar;
    const browser = this.window.gBrowser.selectedBrowser;
    const value = bar.value;
    const query = this.savedQuery || "";
    const searchMode = this.savedSearchMode;
    this.mode = this.savedMode;
    this.savedQuery = null;
    this.savedMode = null;
    this.savedSearchMode = null;
    await bar.setSearchMode(searchMode, browser);
    if (
      version !== this.version ||
      browser !== this.window.gBrowser.selectedBrowser ||
      !bar.focused
    ) {
      return;
    }
    if (this.inputRevision === inputRevision && bar.value === value) {
      bar.search(query);
    }
    this.describe();
  }

  async completeEngineAlias() {
    const bar = this.window.gURLBar;
    const match = /^\s*(@\S+)\s+(.*)$/su.exec(bar.value);
    if (!match) {
      return;
    }
    const browser = this.window.gBrowser.selectedBrowser;
    const version = this.version;
    const inputRevision = this.inputRevision;
    const engine = await lazy.UrlbarSearchUtils.engineForAlias(match[1]);
    if (
      !engine ||
      version !== this.version ||
      inputRevision !== this.inputRevision ||
      browser !== this.window.gBrowser.selectedBrowser ||
      !bar.focused
    ) {
      return;
    }
    this.reset();
    const acceptedVersion = this.version;
    bar.controller.cancelQuery();
    setQueryValue(bar, match[2]);
    await bar.setSearchMode(
      { engineName: engine.name, entry: "keywordoffer", isPreview: false },
      browser
    );
    if (
      acceptedVersion === this.version &&
      browser === this.window.gBrowser.selectedBrowser &&
      bar.focused
    ) {
      bar.startQuery({ allowAutofill: false });
    }
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
    if (result?.providerName === "ModalLocal" || result?.autofill) {
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
    this.savedMode = null;
    this.savedSearchMode = null;
    this.resumeContext = null;
    this.describe();
  }

  destroy() {
    this.reset();
    this.window.gURLBar.removeEventListener("searchmodechanged", this);
    this.window.gURLBar.inputField.removeEventListener("input", this);
    this.window.gURLBar.view.panel.removeEventListener("mousedown", this);
    states.delete(this.window.gURLBar);
  }
}

/** Fuzzy destinations, local pickers, and engine-alias selection. */
class ModalLocalProvider extends UrlbarProvider {
  get name() {
    return "ModalLocal";
  }
  get type() {
    return lazy.UrlbarShared.PROVIDER_TYPE.PROFILE;
  }
  getPriority(context) {
    return isEngineAliasQuery(context) ? 10 : 0;
  }

  async isActive(context, controller) {
    const state = states.get(controller.input);
    return (
      !!state?.window.gModalNavigation?.enabled &&
      (state.mode === "engines" ||
        isEngineAliasQuery(context) ||
        ((state.mode === "destinations" || LOCAL_MODES.has(state.mode)) &&
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
    if (mode === "engines" || isEngineAliasQuery(context)) {
      await state.ready;
      const engines = await lazy.SearchService.getVisibleEngines();
      const aliasEntries = await lazy.UrlbarSearchUtils.tokenAliasEngines();
      const aliasesByName = new Map(
        aliasEntries.map(({ engine, tokenAliases }) => [
          engine.name,
          tokenAliases,
        ])
      );
      if (!valid()) {
        return;
      }
      const filter =
        mode === "engines"
          ? ""
          : context.searchString.trim().toLocaleLowerCase();
      const matches = engines
        .map(engine => ({
          engine,
          aliases: aliasesByName.get(engine.name) || [],
        }))
        .filter(({ engine, aliases }) =>
          filter.startsWith("@")
            ? filter === "@" || aliases.some(alias => alias.startsWith(filter))
            : fuzzyScore(filter, [engine.name, ...aliases]) !== null
        )
        .sort(
          (a, b) =>
            Number(b.aliases.includes(filter)) -
            Number(a.aliases.includes(filter))
        );
      for (const { engine, aliases } of matches) {
        const icon =
          (await UrlbarUtils.getEngineIconUrl(engine, controller)) ||
          "chrome://browser/skin/search-engine-placeholder@2x.png";
        if (!valid()) {
          return;
        }
        add(
          this,
          new lazy.UrlbarResult({
            type: lazy.UrlbarShared.RESULT_TYPE.SEARCH,
            source: lazy.UrlbarShared.RESULT_SOURCE.SEARCH,
            hideRowLabel: true,
            payload: {
              engine: engine.name,
              keyword: aliases[0] || "",
              keywords: aliases.join(", "),
              icon,
              query: mode === "engines" ? state.savedQuery || "" : "",
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
    const hasAutofill = context.results.some(result => result.autofill);
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
          suggestedIndex:
            index + Number(mode === "destinations" || hasAutofill),
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
