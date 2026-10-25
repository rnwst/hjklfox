# Modal keyboard navigation

This fork includes an experimental, Helix-oriented navigation component in
`browser/components/modal/`. It is enabled by default. Set
`browser.modal.enabled` to `false` in `about:config` to disable modal key
interception. There is no command prompt.

## Modes and focus

Command mode consumes unbound printable keys before websites see them. Explicit
editing focus enters insert mode; page autofocus does not. Press `i` to resume
the last page editor, or Escape to leave insert mode and blur it. An explicitly
focused control takes precedence over restoring the last editor. Tab switching
does not restore a previous insert mode, and late page loading does not undo a
deliberately selected mode.

Insert mode tints the toolbar green, blended with the current theme. Address-bar
focus is distinguished from page editing and does not apply that tint. There is
no visible mode badge. A localized nonvisual status announces mode changes.
Browser menus, fullscreen, pointer lock, and IME retain native Escape handling.

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
| `gw` | Select a visible link or button by its letter label |
| `/` | Open page search |
| `n`, `N` | Next or previous search result |
| `i` | Enter insert mode |
| `Esc` | Cancel or return to command mode |

Numeric prefixes apply to scrolling and tab switching, for example `5j` and
`3gn`. Counts are capped at 999. Keys use logical characters rather than physical
positions. Matching command-mode bindings override Firefox shortcuts; insert
mode retains native shortcuts.

The JSON string preference `browser.modal.keybindings` overrides defaults:

```json
{"z": "scroll.down", "j": null, "g t": "tab.next"}
```

Use spaces between sequence keys and `C-` for Control. `null` removes a binding;
unknown command identifiers are ignored. Escape remains fixed. Unbinding a
printable key does not pass it to websites in command mode.

## Page hints

Hints cover anchors and buttons, including cross-process frames. Disabled,
inert, and invisible targets are excluded and activation revalidates the target.
Native click, user activation, and form submission behavior are preserved.
Yellow labels survive layout changes, scrolling, and stable target replacement.
Escape cancels and Backspace corrects the prefix. Navigation cancels hints;
unloading a subframe removes only that frame's hints.

Collection scans document anchors and buttons, not shadow trees or arbitrary
interactive roles. Screen-reader usability requires manual validation.

## Architecture and checks

`ModalNavigation.sys.mjs` owns window state and keyboard dispatch.
`Keymap.sys.mjs` parses bindings and generates hint labels. Content actors handle
focus, scrolling, and anonymous-content overlays; the parent validates messages
against the selected tab's current documents. Integration is limited to browser
startup, actor registration, packaging, and preferences.

An artifact build is sufficient. Run the unit and browser suites with:

```sh
./mach build
./mach xpcshell-test browser/components/modal/tests/unit
./mach mochitest --headless browser/components/modal/tests/browser
./mach lint --linter eslint --linter stylelint browser/components/modal
```

On Linux/X11, setting `HJKLFOX_NATIVE_KEYS=1` enables native keyboard tests using
`xdotool`. Run without `--headless` on an X11 display, including Xvfb. These tests
exercise real shortcut routing, scrolling, hints, history, and editor input.
Keyboard layouts, IME, and assistive technology also require manual validation.
