/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { SearchService } from "moz-src:///toolkit/components/search/SearchService.sys.mjs";

export const DEFAULT_ENGINES = Object.freeze([
  {
    alias: "@g",
    name: "Google",
    domain: "google.com",
    url: "https://www.google.com/search?q={searchTerms}",
  },
  {
    alias: "@d",
    name: "DuckDuckGo",
    domain: "duckduckgo.com",
    url: "https://duckduckgo.com/?q={searchTerms}",
  },
  {
    alias: "@w",
    name: "Wikipedia",
    domain: "wikipedia.org",
    url: "https://en.wikipedia.org/w/index.php?search={searchTerms}",
  },
  {
    alias: "@p",
    name: "Perplexity",
    domain: "perplexity.ai",
    url: "https://www.perplexity.ai/search?q={searchTerms}",
  },
  {
    alias: "@s",
    name: "Startpage",
    domain: "startpage.com",
    url: "https://www.startpage.com/sp/search?query={searchTerms}",
  },
  {
    alias: "@e",
    name: "Ecosia",
    domain: "ecosia.org",
    url: "https://www.ecosia.org/search?q={searchTerms}",
  },
  {
    alias: "@b",
    name: "Bing",
    domain: "bing.com",
    url: "https://www.bing.com/search?q={searchTerms}",
  },
]);

let initialization;

export function ensureDefaultEngines() {
  if (!initialization) {
    initialization = seedEngines().catch(error => {
      initialization = null;
      throw error;
    });
  }
  return initialization;
}

async function seedEngines() {
  await SearchService.init();
  if (Services.prefs.getBoolPref("browser.modal.engines.initialized", false)) {
    return;
  }
  const engines = await SearchService.getEngines();
  for (const defaults of DEFAULT_ENGINES) {
    if (engines.some(engine => engine.aliases.includes(defaults.alias))) {
      continue;
    }
    const existing = engines.find(engine => {
      const host = engine.getSubmission("test")?.uri.host;
      return host === defaults.domain || host?.endsWith(`.${defaults.domain}`);
    });
    if (existing) {
      if (!existing.hidden && !existing.alias) {
        existing.alias = defaults.alias;
      }
    } else {
      const engine = await SearchService.addUserEngine({
        name: defaults.name,
        url: defaults.url,
        alias: defaults.alias,
      });
      engines.push(engine);
    }
  }
  Services.prefs.setBoolPref("browser.modal.engines.initialized", true);
}
