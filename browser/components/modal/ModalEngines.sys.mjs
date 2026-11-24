/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { SearchService } from "moz-src:///toolkit/components/search/SearchService.sys.mjs";

const ORIGINAL_ENGINES = [
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
];

const DEVELOPER_ENGINES = [
  {
    alias: "@m",
    name: "MDN",
    domain: "developer.mozilla.org",
    url: "https://developer.mozilla.org/en-US/search?q={searchTerms}",
  },
  {
    alias: "@y",
    name: "YouTube",
    domain: "youtube.com",
    url: "https://www.youtube.com/results?search_query={searchTerms}",
  },
  {
    alias: "@aw",
    name: "ArchWiki",
    domain: "wiki.archlinux.org",
    url: "https://wiki.archlinux.org/index.php?search={searchTerms}",
  },
  {
    alias: "@gh",
    name: "GitHub",
    domain: "github.com",
    url: "https://github.com/search?q={searchTerms}",
  },
];

const PACKAGE_AND_HELP_ENGINES = [
  {
    alias: "@so",
    name: "Stack Overflow",
    domain: "stackoverflow.com",
    url: "https://stackoverflow.com/search?q={searchTerms}",
  },
  {
    alias: "@npm",
    name: "npm",
    domain: "npmjs.com",
    url: "https://www.npmjs.com/search?q={searchTerms}",
  },
  {
    alias: "@cr",
    name: "crates.io",
    domain: "crates.io",
    url: "https://crates.io/search?q={searchTerms}",
  },
  {
    alias: "@nix",
    name: "Nix Packages",
    domain: "search.nixos.org",
    url: "https://search.nixos.org/packages?query={searchTerms}",
  },
];

const HASKELL_ENGINES = [
  {
    alias: "@ho",
    name: "Hoogle",
    domain: "hoogle.haskell.org",
    url: "https://hoogle.haskell.org/?hoogle={searchTerms}",
  },
];

const MAP_ENGINES = [
  {
    alias: "@gm",
    name: "Google Maps",
    domain: "maps.google.com",
    url: "https://maps.google.com/maps?q={searchTerms}",
  },
  {
    alias: "@osm",
    name: "OpenStreetMap",
    domain: "openstreetmap.org",
    url: "https://www.openstreetmap.org/search?query={searchTerms}",
  },
];

export const DEFAULT_ENGINES = Object.freeze([
  ...ORIGINAL_ENGINES,
  ...DEVELOPER_ENGINES,
  ...PACKAGE_AND_HELP_ENGINES,
  ...HASKELL_ENGINES,
  ...MAP_ENGINES,
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
  await seedEngineBatch(ORIGINAL_ENGINES, "browser.modal.engines.initialized");
  await seedEngineBatch(
    DEVELOPER_ENGINES,
    "browser.modal.engines.developerInitialized"
  );
  await seedEngineBatch(
    PACKAGE_AND_HELP_ENGINES,
    "browser.modal.engines.packageAndHelpInitialized"
  );
  await seedEngineBatch(
    HASKELL_ENGINES,
    "browser.modal.engines.haskellInitialized"
  );
  await seedEngineBatch(MAP_ENGINES, "browser.modal.engines.mapsInitialized");
}

async function seedEngineBatch(defaultEngines, pref) {
  if (Services.prefs.getBoolPref(pref, false)) {
    return;
  }
  const engines = [...(await SearchService.getEngines())];
  for (const defaults of defaultEngines) {
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
  Services.prefs.setBoolPref(pref, true);
}
