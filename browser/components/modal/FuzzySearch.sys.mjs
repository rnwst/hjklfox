/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export function fuzzyScore(query, fields) {
  let score = 0;
  for (const token of query.toLowerCase().trim().split(/\s+/).filter(Boolean)) {
    let best = -Infinity;
    for (let i = 0; i < fields.length; i++) {
      const field = (fields[i] || "").toLowerCase();
      const index = field.indexOf(token);
      if (index >= 0) {
        best = Math.max(
          best,
          (index === 0 ? 200 : 120) - i * 5 - Math.min(index, 40)
        );
        continue;
      }
      let position = 0;
      let first = -1;
      for (const char of token) {
        const next = field.indexOf(char, position);
        if (next < 0) {
          first = -1;
          break;
        }
        if (first < 0) {
          first = next;
        }
        position = next + 1;
      }
      if (first >= 0) {
        best = Math.max(
          best,
          60 - Math.min(position - first - token.length, 50) - i * 5
        );
      }
    }
    if (!Number.isFinite(best)) {
      return null;
    }
    score += best;
  }
  return score;
}

export function fuzzySqlPattern(token) {
  return `%${Array.from(token.toLowerCase(), char => char.replace(/[\\%_]/g, "\\$&")).join("%")}%`;
}
