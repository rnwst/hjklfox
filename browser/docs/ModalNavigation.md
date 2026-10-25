# Modal keyboard navigation

This fork includes an experimental, Helix-oriented navigation component in
`browser/components/modal/`. It is enabled by default. Set
`browser.modal.enabled` to `false` in `about:config` to disable modal key
interception. The retired shortcuts and simplified browser chrome are separate
fork choices. There is no command prompt.

## Modes and focus

Each browser window owns one active interaction mode: command, insert, or address
bar. Switching between existing tabs returns to command mode; neither page
editing nor address/find-field focus is restored from a tab. Opening a new tab
with Ctrl-t can focus its address bar for a new navigation, but revisiting that
tab does not restore address mode. Navigating to a new document also returns to
command mode. Page autofocus does not enter insert mode. Clicking or tabbing into
an editable field does. Pressing `i` enables insert mode and restores the last
editor in the focused frame if it is still present.
An explicitly focused control takes precedence over restoring the last editor.

In command mode, unbound printable keys are swallowed before reaching page
handlers. Unmatched modified shortcuts and ordinary Tab navigation within pages
remain available. In insert mode, page input works normally. Address-bar focus enters
its own mode, with normal text editing and the native blue focus border; it never
applies the green insert-mode toolbar tint.

Escape cancels a key sequence or link hints, or leaves insert mode and blurs the
page editor. Browser menus, fullscreen, pointer lock, and IME composition retain
their native Escape handling first. In the address bar, one Escape closes
suggestions or the engine picker and returns focus to the page in command mode,
without navigating. Unfinished text is retained for Space-e to resume; an empty
cancelled query restores the current page's address.

Tab and Shift-Tab in the address bar keep focus and the query there; use Escape
to return to page command mode. Tab in the page-find field returns to the page.
Toolbar buttons, tab titles, and new-tab buttons cannot take focus through
Tab, mouse clicks, or programmatic focus. The address and find fields remain
available through their explicit commands or direct interaction, but are skipped
by page Tab traversal. Native menus and dialogs retain their own input handling.

The navigation toolbar has a prominent green fill in insert mode, blended with the
current theme. There is no visible mode text badge. A visually hidden localized
status announcement identifies mode changes to assistive technology. In forced
colors, the tint is omitted.

## Default bindings

| Keys | Action |
| --- | --- |
| `h`, `j`, `k`, `l` | Scroll left, down, up, right |
| `Ctrl-u`, `Ctrl-d` | Scroll half a viewport up or down |
| `Ctrl-f`, `Ctrl-b` | Scroll a full viewport down or up |
| `gg`, `ge` | Scroll to the beginning or end |
| `gh`, `gl` | Scroll to the left or right edge |
| `gn`, `gp` | Next or previous tab |
| `Ctrl-o`, `Ctrl-i` | History back or forward |
| `gw` | Follow a link or activate a button by its letter label |
| `gW` | Open a visible link in a new tab by its letter label |
| `/` | Open page search |
| `n`, `N` | Next or previous search result |
| `i` | Enter insert mode |
| `Esc` | Cancel or return to command mode |
| `Space f` | Fuzzy destinations (history and bookmarks) |
| `Space e` | Edit the existing address/query without clearing it |
| `Space h`, `Space m` | Fuzzy history or bookmarks |
| `Space b` | Fuzzy tab picker |
| `Space s` | Web search in the native address bar |

Numeric prefixes apply to scrolling and tab switching, for example `5j` and
`3gn`. Counts are capped at 999. Keys use logical characters, rather than fixed
physical keyboard positions. In command mode, matching modal bindings override
Firefox's existing bindings, such as `Ctrl-u` for View Source. Insert mode keeps
Firefox's native shortcuts.

Starting a sequence such as `Space` or `g` opens a small completion popup at the
top right, below the navigation toolbar. It shows the remaining keys and their
actions using your current bindings, including custom sequences. Keep typing to
complete the shortcut; the popup does not take focus. Escape, an unmatched key,
changing tabs, or leaving command mode dismisses it.

Alt-d and Ctrl-l no longer focus the address bar; use Space-f from command mode.

The JSON string preference `browser.modal.keybindings` overrides defaults. For
example:

```json
{"z": "scroll.down", "j": null, "g t": "tab.next"}
```

Use spaces between keys in a sequence, `Space` for the space key, and `C-` for
Control, such as `C-d` or `Space f`.
`null` removes a binding. Unbinding a printable key does not pass it to websites
in command mode. Command identifiers and defaults are in `Keymap.sys.mjs`;
unknown command identifiers are ignored. Escape remains the fixed cancellation
key. Avoid assigning a complete command to a prefix used by longer sequences.

## Address-bar navigation

The pickers share Firefox's native URL bar. Space-e focuses its existing text,
exposes the full address for editing, and places the caret at the end. Space-f
starts a fresh destination search. Both enter address-bar mode, not insert mode.
In local picker modes, matches can be
noncontiguous, span multiple query words, and include titles, URLs, and bookmark
tags. Contiguous matches rank above scattered matches; Firefox frecency breaks
ties. Ranking is bounded to 1,000 SQL-filtered candidates. Tab results include
other windows with the same private-browsing and container context.

In the address field, Ctrl-n and Ctrl-p select results without arrow keys. Enter
opens the selected or first local result; Alt-Enter opens it in a new tab (reusing
an empty tab, as Firefox normally does). An
unmatched local query stays in the picker instead of becoming an unexpected web
search. Explicit URLs and engine aliases retain native handling. Use Space-s to
search the web, or type an engine alias followed by your query.

Ctrl-Space opens the engine picker. Type part of a name or alias, select a result
with Ctrl-n/Ctrl-p, then press Enter. Switching engines retains your original
query; Escape restores it and the previous source/engine, then leaves address-bar
mode in the same press. Ctrl-Space again returns to query editing without leaving
the address bar. This uses Firefox's
registered engines, including custom engines configured in Search settings.

On first enabled startup, these default aliases are installed:

| Alias | Engine |
| --- | --- |
| `@g` | Google |
| `@d` | DuckDuckGo |
| `@w` | Wikipedia |
| `@p` | Perplexity |
| `@s` | Startpage |
| `@e` | Ecosia |
| `@b` | Bing |

Existing user aliases and hidden engines are respected. Defaults are not
reapplied after user edits. Engine configuration remains in Firefox's Search
settings; no parallel engine database is maintained.

## Page behavior and link hints

Content actors cover documents loaded in tab browsers, including internal pages.
Editable fields in internal pages use the same insert-mode transitions as web
pages. The address bar and page-find field remain native inputs; Escape returns
focus to the page and command mode after popups have been dismissed.

The default new-tab page shows a keyboard shortcut guide instead of Firefox's
feed. Its key labels come from the active keymap, including custom bindings, and
update when the keybinding preference changes. Disabling modal navigation hides
the guide. Explicit Firefox Home or extension new-tab choices remain in effect.
The startup home page also defaults to `about:newtab` so the reference appears
when opening the browser. Explicitly opening `about:blank` remains blank, and
`browser.toolbars.bookmarks.visibility` defaults to `never`.

The sidebar, its opening shortcuts, and the tab-search button are removed from
browser chrome. Saved vertical tab layouts return to horizontal tabs at startup.
Automatic translation offers default to off; translation can still be requested
manually or re-enabled in settings.

The default System theme follows the operating system's light/dark setting using
Firefox's Nova design, including its colored background gradient and rounded
tabs and address bar. The native GTK color override is disabled by default
(`browser.theme.native-theme`), so GTK colors do not replace Firefox's palette.
Explicit theme and preference choices remain in effect.

Hints cover ordinary `a[href]` links and `<button>` elements, including
cross-process frames. Disabled, aria-disabled, inert, and invisible targets are
excluded. Activation rechecks current state and preserves native button clicks
and form submission. Replaced buttons can retain labels when they have stable IDs.
Press `g` then `Shift+w` for new-tab hints instead. This mode labels links only
and activates them with a native middle-click, respecting Firefox's
foreground/background tab preference and the link's native behavior.
Labels are unique across the tab, with up to 1,000 targets per frame. Escape
cancels; Backspace corrects a still-valid prefix. A prefix that matches no hint
automatically cancels hint mode, so the next keys work as normal commands.
Yellow labels retain their assignments through late loading, scrolling,
resizing, and DOM changes, updating their positions in animation-frame batches.
If hydration replaces an anchor, its label can follow the replacement with the
same destination. An unloaded subframe loses only its own labels. New documents
and tab switches cancel the session. Targets are checked again before activation.
Collection currently scans
the document's anchors and buttons, not shadow trees or arbitrary interactive
roles. Activation follows the target's native action in its current context.

The nonvisual status reports hint mode and the typed prefix. Hint annotations also
include the target's name as visually hidden text; their actual exposure and
usability with screen readers still require manual validation.

## Architecture and upstream integration

- `ModalNavigation.sys.mjs` owns window state and captures keyboard input before
  it reaches content. Its command dispatcher wraps existing Firefox tab/history
  APIs. Content-dependent commands go to the focused frame actor.
- `Keymap.sys.mjs` parses sequences/counts and generates deterministic,
  fixed-length hint labels.
- `ModalKeyPopup.sys.mjs` shows completions from the pending keymap prefix in a
  non-focusing in-window popover, using the reference page's command descriptions.
  `ModalChild.sys.mjs` supplies an anonymous blur layer in the content process
  beneath the popover, so the translucent background blurs the page while the
  shortcut text remains in browser chrome.
- `ModalNewTabChild.sys.mjs` renders the new-tab guide from the same keymap.
  Each command has a `modal-shortcut-` Fluent description derived from its
  identifier. Browser tests require descriptions for every default command,
  so new commands must include guide text alongside their implementation.
- `ModalUrlbar.sys.mjs` adds the local provider and keyboard controls to the native
  URL bar. `FuzzySearch.sys.mjs` contains the matching/ranking helpers;
  `ModalEngines.sys.mjs` seeds default aliases through SearchService.
- `ModalParent.sys.mjs` accepts focus/lifecycle messages only from the selected
  tab's current documents.
- `ModalChild.sys.mjs` handles page focus, scrolling, and anonymous-content
  overlays. Hints are not inserted into the page's ordinary DOM. Activation uses
  Firefox's mouse-event synthesis, preserving the document's link behavior.

The runtime integration points are the browser-window startup hook in
`browser-init.js`, the actor declaration in `DesktopActorRegistry.sys.mjs`,
component packaging, and the defaults in `firefox.js`. No native engine changes
are required. `Tabbrowser.sys.mjs` suppresses per-tab chrome-focus memories while
modal navigation is enabled. Retired shortcuts/menu entries are also reflected in
`browser-sets.inc.xhtml` and `browser-menubar.inc.xhtml`. On upstream updates,
pay particular attention to keyboard-event
routing, focus APIs, anonymous-content overlays, and the existing tab/history
methods used by the dispatcher.

## Development checks

An artifact build is sufficient:

```sh
./mach build
./mach xpcshell-test browser/components/modal/tests/unit
./mach mochitest --headless browser/components/modal/tests/browser
./mach lint --linter eslint --linter stylelint browser/components/modal
```

Browser tests cover event suppression, focus/mode transitions, tab restoration,
cross-process link hints, history, custom bindings, disabling the component,
address-bar editing/resumption, single-Escape exit, and light/dark theme tinting.

On Linux/X11, setting `HJKLFOX_NATIVE_KEYS=1` enables native keyboard tests using
`xdotool`. Run without `--headless` on an X11 display, including Xvfb. These tests
exercise real shortcut routing, page navigation, editor input, and address-bar
result and engine selection.

Cross-platform keyboard layouts,
IME input, and assistive-technology interaction also require manual validation.
