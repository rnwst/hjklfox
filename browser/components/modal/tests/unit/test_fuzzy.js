/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { fuzzyScore, fuzzySqlPattern } = ChromeUtils.importESModule(
  "moz-src:///browser/components/modal/FuzzySearch.sys.mjs"
);

add_task(function matching_and_ranking() {
  Assert.notEqual(fuzzyScore("nbla armp", ["Nebula Array Mapping"]), null);
  Assert.equal(fuzzyScore("nbla missing", ["Nebula Array Mapping"]), null);
  Assert.greater(
    fuzzyScore("map", ["Map reference"]),
    fuzzyScore("map", ["Many Apple Pies"])
  );
  Assert.notEqual(fuzzyScore("cnstll", ["", "", "constellations"]), null);
  Assert.equal(fuzzyScore("", ["Anything"]), 0);
  Assert.equal(fuzzySqlPattern("a%_"), "%a%\\%%\\_%");
});
