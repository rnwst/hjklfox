# Modal keyboard navigation

This fork includes an experimental, Helix-oriented navigation component in
`browser/components/modal/`. It is enabled by default. Set
`browser.modal.enabled` to `false` in `about:config` to disable modal key
interception. The retired shortcuts and simplified browser chrome are separate
fork choices. There is no command prompt.

## Modes and focus

Each browser window owns one active interaction mode: command, insert, address
bar, page search, tab selection, or link hints. Switching between existing tabs returns to command mode;
neither page editing nor address/find-field focus is restored from a tab. Opening a new tab
with `tn` focuses its address bar for a new navigation, but revisiting that
tab does not restore address mode. Navigating to a new document also returns to
command mode, except while selecting tabs: tab selection survives page loads.
Page autofocus does not enter insert mode. Clicking or tabbing into
an editable field does. Pressing `i` enables insert mode and restores the last
editor in the focused frame if it is still present.
An explicitly focused control takes precedence over restoring the last editor.

In command mode, arrow-key presses, repeats, and releases pass through to pages.
The `h`, `j`, `k`, and `l` bindings send Left, Down, Up, and Right arrow keys
respectively. Pages can handle or cancel these events; otherwise native arrow-key
behavior applies, including scrolling.
Other keyboard events, including modifier keys and function keys, are withheld
outside insert mode. Firefox's own browser shortcuts are available only in command
mode with no pending key prefix; numeric counts alone do not disable them.
Tab can move focus and Enter can activate a link or button without
exposing the keys to page scripts; scripts can still respond to the resulting
focus changes and clicks. In insert mode, page input works normally, except that
Escape and the command-only Ctrl-w prefix are withheld from the page. A blocked key that starts outside insert mode cannot
leak its release or repeat into a newly focused editor. Address-bar focus enters
its own mode, with normal text editing and the native blue focus border; it never
applies the green insert-mode toolbar tint.
The page-find field likewise uses a separate search mode with no green toolbar fill.

Escape cancels a key sequence or link hints, or leaves insert mode and blurs the
page editor. Browser menus, fullscreen, pointer lock, and IME composition retain
their native Escape handling first. In the address bar, one Escape closes
suggestions or the engine picker and returns focus to the page in command mode,
without navigating. Unfinished text is retained for Space-e to resume; an empty
cancelled query restores the current page's address.

Entering page fullscreen (including videos and video-player containers) activates
insert mode automatically. Escape exits fullscreen using Firefox's native handling.
Leaving fullscreen by any route returns to command mode with focus on the page;
the previous editing mode is not restored. Browser-window fullscreen (F11) does
not change the interaction mode.

Tab and Shift-Tab in the address bar keep focus and the query there; use Escape
to return to page command mode. Tab and Shift-Tab also stay in the page-find field;
Enter submits and defocuses it, while Escape cancels and hides it.
Toolbar buttons, tab titles, and new-tab buttons cannot take focus through
Tab, mouse clicks, or programmatic focus. The address and find fields remain
available through their explicit commands or direct interaction, but are skipped
by page Tab traversal. Native menus and dialogs retain their own input handling.

The navigation toolbar has a prominent green fill in insert mode and an amber
fill in tab selection mode, blended with the current theme. There is no visible
mode text badge. A visually hidden localized status announcement identifies
mode changes to assistive technology. In forced
colors, the tint is omitted.

## Default bindings

| Keys | Action |
| --- | --- |
| `h`, `j`, `k`, `l` | Send Left, Down, Up, Right arrow keys to the page |
| `Ctrl-u`, `Ctrl-d` | Scroll half a viewport up or down |
| `Ctrl-f`, `Ctrl-b` | Scroll a full viewport down or up |
| `gg`, `ge` | Scroll to the beginning or end |
| `gh`, `gl` | Scroll to the left or right edge |
| `tj`, `tk` | Next or previous tab |
| `tn` | Open a new tab |
| `tN` | Open a new tab before the current tab |
| `tu` | Reopen the last closed tab (replaces Ctrl-Shift-T) |
| `tq` | Close all selected tabs, or the current tab |
| `tv` | Enter tab selection mode |
| `tJ`, `tK` | Move the selected tabs forward or backward |
| `th`, `tl` | Switch to the first or last tab |
| `tH`, `tL` | Move the selected tabs to the beginning or end of the tab strip |
| `tgj`, `tgk` | Next or previous tab within the current group |
| `tgJ`, `tgK` | Move the selected tabs within their groups, wrapping at the edges |
| `tgh`, `tgl` | Switch to the first or last tab within the current group |
| `tgH`, `tgL` | Move the selected tabs to the beginning or end of their groups |
| `tgn` | Create a named group with the selected tabs |
| `tgm` | Move the selected tabs to an existing group |
| `tgu` | Remove the selected tabs from their groups |
| `tgs` | Select all tabs in the current group |
| `tgf`, `tgo` | Fold or unfold the current group |
| `tge` | Edit the current group’s name and colour |
| `Ctrl-w n` | Create a split view and focus its native tab picker |
| `Ctrl-w q` | Separate the current split view, keeping its tabs open |
| `Ctrl-o`, `Ctrl-i` | History back or forward |
| `gw` | Follow a link or activate a button by its letter label |
| `gW` | Open a visible link in a new tab by its letter label |
| `/` | Edit a page-search query |
| `n`, `N` | Next or previous submitted search result |
| `i` | Enter insert mode |
| `Esc` | Cancel or return to command mode |
| `Space f` | Clear and focus the address bar |
| `Space e` | Edit the existing address/query without clearing it |
| `Space h`, `Space m` | Start a new history or bookmark search in the address bar |
| `Space b` | Start a new open-tab search in the address bar |
| `Space s` | Start a new search with the default search engine |

Numeric prefixes apply to arrow presses, scrolling, tab switching, and tab movement, for example
`5j`, `3tj`, and `3tJ`. Counts are capped at 999. Keys use logical characters,
rather than fixed physical keyboard positions. In command mode, matching modal bindings override
Firefox's existing bindings, such as `Ctrl-u` for View Source. Other modes disable
native browser shortcuts without cancelling page input or native text editing.
Native menus and dialogs cancel hints and pending sequences and enter command
mode; closing them keeps command mode active. Autocomplete and address-bar
suggestions retain their editing mode and existing controls.

Starting a sequence such as `Space`, `g`, or `t` opens a small completion popup at the
top right, below the navigation toolbar. It shows the remaining keys and their
actions using your current bindings, including custom sequences. Keep typing to
complete the shortcut; the popup does not take focus. Escape, an unmatched key,
changing tabs, or leaving command mode dismisses it.
The popup uses the available page height, minus margins, before scrolling.

Alt-d and Ctrl-l no longer focus the address bar; use Space-f from command mode.
Ctrl-t and Ctrl-w no longer open or close tabs, including in insert mode. Use
`tn` and `tq` in command mode. Ctrl-w starts a split-command sequence only in
command mode; press and release Ctrl-w, then `n` or `q`.

The JSON string preference `browser.modal.keybindings` overrides defaults. For
example:

```json
{"z": "key.down", "j": null, "g t": "tab.next"}
```

Use spaces between keys in a sequence, `Space` for the space key, and `C-` for
Control, such as `C-d` or `Space f`.
`null` removes a binding. Unbinding a printable key does not pass it to websites
in command mode. Command identifiers and defaults are in `Keymap.sys.mjs`;
unknown command identifiers are ignored. Escape remains the fixed cancellation
key. Avoid assigning a complete command to a prefix used by longer sequences.

## Tab groups

Ordinary `tj` and `tk` navigation treats each folded group as one stop, using
its last-active eligible tab. Unfolded groups contribute every tab. Counts such
as `3tj` count these stops, so hidden members do not change the destination.
Navigation wraps around the window.

`tgj` and `tgk` cycle within the current group, wrapping at its boundaries and
supporting counts. They work with folded and unfolded groups and do nothing on
ungrouped tabs. Navigation never changes a group's folded state. A folded group
shows its active tab with a position such as `2/6` instead of an additional-tab
count. If its last-active tab disappears, navigation uses the most recently
active remaining eligible member, falling back to tab order.

`tJ` and `tK` move all selected tabs as a contiguous block, closing gaps and
preserving tab order, selection, and the active tab. With no multiselection they
act on the current tab. Counts start at the selection's leading edge in the
movement direction; selected tabs do not consume steps. A folded group or split
view counts as one stop. Other unfolded groups contribute their individual
members, and targeting a member places the block inside that group.

Fully selected groups move intact, preserving their identity and folding.
When moving whole groups, destination groups count as single stops, so groups
are never nested. Partially selected groups stay behind: selected members leave
them. Exiting the leading member's partial group counts as one step. For example,
moving the outer members of `[A B C]` forward once produces `[B] A C`, without
crossing the next tab. Fully selected split views stay intact; selecting only
part of a split detaches the selected panes, leaving their partners open in their
original group. Moves do not wrap around the window. Mixed pinned/unpinned
selections move as separate blocks within their respective sections.

`tgJ` and `tgK` reorder selected tabs as a block within each of their groups,
leaving ungrouped tabs alone. They support counts and wrap through the available
block positions: moving forward from the last position puts the block first;
moving backward from the first puts it last. They preserve folding and membership.
A wholly selected group has no other position to move to.

`th` and `tl` select the first and last navigation stops in the window, using
the last-active member when the endpoint is a folded group. `tgh` and `tgl`
select the first and last eligible members of the current group.

`tH` and `tL` move the selected block to the beginning and end of the tab strip,
preserving whole selected groups and leaving partial groups behind.
Pinned tabs stay in the pinned section; unpinned tabs stay
after it. `tgH` and `tgL` instead move to the first and last positions within
each selected tab's group. These commands preserve selection and folding. Group-scoped
navigation and reordering do nothing on ungrouped tabs. Endpoint commands ignore numeric prefixes;
hidden and closing tabs are excluded from navigation and endpoint selection.

`tgn` creates a group with the selected tabs and opens Firefox's native
“Create tab group” popup, with the name field focused and colour choices
available. Enter confirms; Escape cancels and ungroups the tabs using Firefox's
native cancellation behaviour. `tgm` uses the address bar to search existing
groups in the current window. Both use the native multi-tab selection, falling
back to the current tab when no other tabs are selected. A split view stays
intact when both members are selected. If only one member is selected, it is
separated before grouping; the unselected partner remains open in its original
group, if any. Pinned tabs are excluded from grouping. `tgu` removes the selected
tabs or split views from their groups without closing them.

`tgf` and `tgo` explicitly fold and unfold the current group without
changing the selected tab. `tge` opens Firefox's native group editor for
name and colour changes. The `tgm` destination picker shows group sizes and
folded state; use Ctrl-n/Ctrl-p and Enter to choose, or Escape to cancel.

`tgs` selects all eligible tabs in the current group, unfolding it if needed.
It replaces the previous selection, keeps the displayed tab unchanged, and
stays in command mode so grouping or closing commands can act on the selection
immediately. It does nothing on an ungrouped tab.

`Space b` includes folded-group members and matches group names as well as tab
titles and URLs. Selecting a result activates that exact tab, even if other tabs
have the same URL, and leaves the group's folded state unchanged. Genuinely
hidden tabs remain excluded; the tab picker's private-window and container
restrictions still apply.

## Tab selection

`tv` starts a fresh selection anchored at the current tab. The displayed tab
and anchor stay fixed; an outline on the tab strip marks a separate selection
cursor. The toolbar turns amber while this mode is active. Page loads do not
exit this mode or reset the anchor, cursor, or selection. In this mode:

| Keys | Action |
| --- | --- |
| `j`, `k` | Move the selection cursor forward or backward and update the range |
| `h`, `l` | Move the selection cursor to the first or last tab and update the range |
| `Esc` | Return to command mode, retaining the selection |

Counts work, for example `5j` moves the cursor forward five tabs. The selected
range always runs from the anchor to the cursor, inclusive. Reversing direction
shrinks it; crossing the anchor extends it in the opposite direction. For example,
`j` followed by `k` leaves only the original tab selected. Selection stops at
the window edges instead of wrapping.
Hidden and closing tabs are excluded. Entering a folded group unfolds it
permanently and selects its leftmost member when moving forward or its rightmost
member when moving backward. Every traversed tab counts individually; range
selection unfolds all groups it crosses. Split-view members count as individual
tabs: selecting one does not select its partner unless both fall within the range.

After Escape, use `tgn` to create a group, `tgm` to add the selection to an
existing group, or `tq` to close all selected tabs. Reentering `tv` resets the
selection to the displayed tab. Ordinary tab switches retain Firefox's native
selection-clearing behaviour.

## Split views

In command mode, `Ctrl-w n` splits the current tab with Firefox's native
`about:opentabs` picker. Its search field receives focus in insert mode, ready
for typing. Tab or Arrow Down from the search field focuses the first result;
use the native list's keyboard navigation and Enter to choose the second tab.
Choosing a tab returns to command mode.

`Ctrl-w q` separates the current split view without closing either normal tab.
If the second side is still the native picker, Firefox removes that temporary
tab. Leave insert mode with Escape before using a split command. Split creation
uses Firefox's native restrictions, including excluding pinned and already-split
source tabs.

## Page search

Press `/` in command mode to edit a search. Typing does not search or scroll the
page. Enter submits the term and returns focus to the page in command mode,
leaving the search bar visible. Use `n` and `N` to move to the next or previous
match. Repeated Enter in command mode does not advance results. The native
previous/next buttons are hidden in modal navigation.

Tab and Shift-Tab keep focus in the search field. Search-option access keys such
as Alt-a (Highlight All) work only while the search field is focused. The options
are disabled and greyed out outside search mode; refocusing the field enables them.
Escape while editing cancels the search, hides the bar, and clears highlighting,
including in other frames
and PDFs. Highlighting is visible only while the search bar is visible. Escape
in command mode leaves the bar alone; press `/` then Escape to close it.
Leave search mode with Escape before using native tab-switching shortcuts. To open a tab with
`tn`, first return to command mode with Escape.
In insert mode, `/` is passed to the page normally and does not open Firefox's
find bar.

## Address-bar navigation

The pickers share Firefox's native URL bar. Space-e focuses its existing text,
exposes the full address for editing, and places the caret at the end. Space-f
starts a fresh address or web search. Both enter address-bar mode, not insert mode.
Clicking the address bar or opening a new tab uses the same destinations mode as
Space-f, but clicking preserves the existing text and mouse selection. Clicking
within an active history, bookmarks, tabs, or engine picker preserves its scope.
Space-e resumes the previous query mode when available, otherwise using destinations.
Destination, history, and bookmark queries support Firefox's native inline URL
completion alongside fuzzy results, respecting the autofill preference and source
restriction. The empty input is not autofilled until you type.
In local picker modes, matches can be
noncontiguous, span multiple query words, and include titles, URLs, and bookmark
tags. Contiguous matches rank above scattered matches; Firefox frecency breaks
ties. Ranking is bounded to 1,000 SQL-filtered candidates. Tab results include
other windows with the same private-browsing and container context.

In the address field, Ctrl-n and Ctrl-p select results without arrow keys.
In the default destinations mode, Enter navigates to an address or searches with
the default engine, unless you select a different suggestion. Fuzzy history and
bookmark matches appear alongside the native suggestions without replacing the
default search action. Only the explicit history, bookmarks, and tab pickers stay
local: Enter opens their selected or first match, and an unmatched query stays in
the picker. Alt-Enter opens a destination in a new tab (reusing an empty tab, as
Firefox normally does). Use Space-s to start a search explicitly scoped to the
default engine, or type an engine alias followed by a space to select that engine.

Remote search-engine suggestions are disabled in the default address-bar mode.
Selecting an engine through Space-s, an alias followed by a space, or confirming
an engine in the picker allows that engine to suggest queries as you type. Merely
opening or cycling through the engine picker keeps the query local. Space-f
returns to the default mode and stops fetching remote suggestions.
Local history/bookmark suggestions and the “Search with” action work in default
mode; pressing Enter submits the query to the chosen engine.

The defaults are `browser.search.suggest.enabled = true` and
`browser.urlbar.suggest.searches = false`. Existing profiles with explicit
overrides can set these values in `about:config` to get the same behavior. Setting
`browser.search.suggest.enabled` to `false` disables remote suggestions in engine
mode too. Private-window suggestion preferences are respected.

Typing `@` or an engine-alias prefix uses the same engine choices as Ctrl-Space,
with icons and aliases. Exact aliases rank before longer prefix matches.
Ctrl-Space keeps an already active `@` picker instead of replacing its input.

Ctrl-Space opens the engine picker whether or not an engine is already selected.
The query stays visible and editable while all available engines are listed.
Select an engine with Ctrl-n/Ctrl-p, then press Enter to confirm it. Press Enter
again to submit the query to that engine. Ctrl-Space again cancels engine selection
and restores the previous source/engine while keeping your query edits. Escape
also restores the previous source/engine, then leaves address-bar mode. This uses
Firefox's registered engines, including custom engines configured in Search settings.

Typing a complete alias followed by a space also selects that engine from inside
the picker. This starts a new query: any text after the alias becomes the query,
and subsequent typing continues it. The old page address is not inserted into it.

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
| `@m` | MDN |
| `@y` | YouTube |
| `@aw` | ArchWiki |
| `@gh` | GitHub |
| `@so` | Stack Overflow |
| `@npm` | npm |
| `@cr` | crates.io |
| `@nix` | Nix Packages |
| `@ho` | Hoogle |

Existing user aliases and hidden engines are respected. Defaults are not
reapplied after user edits. MDN, YouTube, ArchWiki, GitHub, Stack Overflow, npm,
crates.io, Nix Packages, and Hoogle are also seeded once for existing profiles on
upgrade. Engine configuration remains in Firefox's Search settings; no parallel
engine database is maintained.

## Page behavior and link hints

Content actors cover documents loaded in tab browsers, including internal pages.
Editable fields in internal pages use the same insert-mode transitions as web
pages. The address bar and page-find field remain native inputs; Escape returns
focus to the page and command mode after popups have been dismissed.

The default new-tab page shows a keyboard shortcut guide instead of Firefox's
feed. Its key labels come from the active keymap, including custom bindings, and
update when the keybinding preference changes. Disabling modal navigation hides
the guide. Explicit Firefox Home or extension new-tab choices remain in effect.
An address-mode section lists Ctrl-n/Ctrl-p suggestion selection and Ctrl-Space
engine selection from the bindings used by the address-bar handler.
The tab-selection section lists its separate selection bindings.
The startup home page also defaults to `about:newtab` so the reference appears
when opening the browser. Explicitly opening `about:blank` remains blank, and
`browser.toolbars.bookmarks.visibility` defaults to `never`.
New profiles contain no bundled bookmarks or bookmark folders. Bookmarks already
saved in an existing profile, including previously imported defaults, are retained.

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
- `ModalFind.sys.mjs` defers native find events until Enter, keeps Enter from
  repeating the search, and returns focus to the page while keeping the bar visible.
- `ModalParent.sys.mjs` accepts focus/lifecycle messages only from the selected
  tab's current documents.
- `ModalChild.sys.mjs` filters page keyboard events, handles focus and scrolling,
  and draws anonymous-content overlays. Hints are not inserted into the page's
  ordinary DOM. Activation uses
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
