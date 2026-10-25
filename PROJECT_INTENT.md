# Hjklfox: manifesto and working principles

## Manifesto

Hjklfox is a fully keyboard-driven Firefox fork designed to feel natural to a
Helix user. It is a browser, not an editor clone: favor contextual, discoverable
actions over importing Vim conventions or a command language.

Keep Firefox's engine, compatibility, and security model. The fork must remain
practical to update continuously from Firefox `main`. Prefer a small integration
surface and native Firefox services over parallel implementations or invasive
changes to Gecko.

The browser should be visually quiet. Its current defaults and implemented
controls are documented in [ModalNavigation.md](browser/docs/ModalNavigation.md).
That document and `Keymap.sys.mjs` are the reference for existing behavior; this
handoff is not a roadmap.

## Behavioral principles

- Distinguish **command**, **insert**, and **address-bar** interaction modes.
  Command mode consumes unbound printable keys before websites see them. Explicit
  editing focus enters insert mode; unsolicited page autofocus must not.
- Insert mode uses a prominent theme-aware green toolbar fill. Address-bar mode uses
  native address-bar focus styling and never the green tint. Do not add a visible
  mode text badge.
- Tab switching must not resurrect a tab's old insert or address mode, including
  Firefox's native per-tab address/find-field focus memories. Completing a page
  load must not undo a mode deliberately selected while loading.
- Keep navigation toolbar and tab-strip controls unfocusable. Address and find
  fields allow intentional editing and are skipped by webpage Tab traversal.
  Tab and Shift-Tab stay in the address bar; Escape returns to page command mode.
  Preserve webpage Tab navigation.
- One Escape leaves address-bar editing, including its results/engine picker,
  without navigating. Keep the existing text available for editing; restore the
  current address when cancelling an empty query. Preserve native IME and
  unrelated dialog/menu escape handling.
- Page hints retain their labels while geometry changes. Revalidate visibility,
  disabled/inert state, and the live target before activation. Preserve native
  clicks, user activation, and form behavior.
- Use native URL-bar results, Places, SearchService, tab operations, and session
  state. Local pickers must not silently turn an unmatched query into a network
  search. Respect private-window/container boundaries and explicit user settings.
- Seed engine aliases once; do not overwrite later user changes. Product-level
  chrome simplifications and retired shortcuts are separate from the switch that
  disables modal key interception.
- Keep the new-tab keyboard guide and prefix popup generated from the active
  keymap. Add a localized guide description with each new command; the coverage
  test must continue to require descriptions for all default commands.

## Architecture and review boundaries

The implementation is isolated in `browser/components/modal/`:

- `ModalNavigation.sys.mjs`: window interaction state, keyboard dispatch, and hint
  coordination. `Keymap.sys.mjs` owns bindings, sequences/counts, and hint labels.
- `ModalParent.sys.mjs` / `ModalChild.sys.mjs`: selected-document validation,
  frame-local focus/scrolling, and anonymous-content hint overlays.
- `ModalUrlbar.sys.mjs`: native URL-bar adapter and local result provider.
  `FuzzySearch.sys.mjs` handles matching; `ModalEngines.sys.mjs` seeds aliases.
- `SimplifiedChrome.sys.mjs`, component CSS, and `browser/modal.ftl`: browser
  presentation and localization.

`ModalNavigation.mode` is an interaction mode. `ModalUrlbar.mode` is a query source
or picker state; null means native URL-bar handling. Do not conflate them.

Keep upstream edits concentrated in window startup (`browser-init.js`), actor
registration (`DesktopActorRegistry.sys.mjs`), packaging, preferences
(`firefox.js`), tab-switch focus memory (`Tabbrowser.sys.mjs`), and the existing
key/menu definitions. Avoid unrelated formatting,
renames, or copies of upstream services: those increase future merge work.

Important invariants established by regressions:

- Window capture listeners receive subdocument unloads. Tear down only when the
  browser window's own document unloads.
- Capture keys at the window root; otherwise native shortcuts can win. Bound
  modified commands must remain modal during hint selection too.
- Restore URL-bar text through its native value/typed-value/page-proxy APIs.
  In this checkout, `search(..., { startQuery: false })` changes only the textbox
  and can leave native formatter metadata stale.
- Version/cancellation checks must prevent late queries or engine initialization
  from reopening a dismissed picker or stealing focus in another tab.
- `sidebar.revamp` selects modern versus legacy implementations; it is not a
  sidebar-disable switch. Retain native internals and normalize restored layouts
  through their APIs rather than hiding an active vertical tab strip.

## Continuous upstream integration

- Preserve the original Firefox history. Keep fork commits topical and separate
  upstream imports from feature changes. Prefer merges for published divergent
  history rather than repeatedly rewriting shared commits.
- Use Conventional Commits for fork work and retain upstream commit messages.
  Never reset or force-sync a feature-bearing fork branch to the Mozilla tip.
- Verify remote identities before updating. Here, `upstream` and `source` both
  refer to **rnwst/hjklfox**, the owner's synchronized fork; `origin` is
  **rnwst-bot/hjklfox**. The Mozilla parent is **mozilla-firefox/firefox**.
  The name `upstream` alone does not mean the Mozilla repository.
- Fetch through the harness remote-management tool. Fast-forward when possible;
  if feature commits cause divergence, inspect the complete incoming range and
  resolve the upstream merge deliberately. Do not fold upstream history into a
  feature commit.
- Preserve the working tree first, including untracked component files: ordinary
  `git diff` does not include them. Inspect possible path collisions before
  updating. The owner transfers source via rsync; do not make source tarballs.
- A clean textual merge is insufficient. Review changes to the actor, focus,
  URL-bar/provider, search, sidebar, and tab APIs used by the adapters, then build
  and test against matching compiled artifacts.
- Use `./mach build` after an upstream update to refresh artifacts/configuration.
  Honor `CLOBBER` with `./mach clobber` when required; do not bypass it by touching
  the marker. `build faster` is for subsequent frontend-only changes, not the
  initial validation of a new upstream revision. Test-only edits need no rebuild.
- After syncing new modules or packaging changes into an existing build, run
  `./mach build-backend` before `./mach build faster`. Rsync can preserve older
  source timestamps, so incremental builds may miss changed manifests. Include
  untracked source files in the sync. A missing `moz-src:///` module can abort
  modal initialization and interrupt browser startup; check both the source file
  and its installed counterpart under `obj-*/dist/bin/moz-src/`.

## Environment and verification tools

The managed host is NixOS. Its dependencies are operator-provided; Mozilla's
distro bootstrapper does not support this host. Use the existing artifact
configuration and `MOZBUILD_STATE_PATH=/tmp/mozbuild`. Runtime libraries for
downloaded binaries are supplied through nix-ld. `MOZ_UPLOAD_DIR` must point to a
writable location for xpcshell; without it, profiler directory discovery has
previously deadlocked startup. Do not disable browser sandboxes to fix tooling.

Searchfox indexes upstream, not the local fork. Use `searchfox-cli` to find native
APIs, then verify their signatures against the checked-out revision. The `moz`
MCP tools mentioned in upstream guidance are not exposed by this harness.

Focused checks (logs belong in Git-ignored `artifacts/`):

```sh
MOZ_UPLOAD_DIR="$PWD/artifacts" MOZBUILD_STATE_PATH=/tmp/mozbuild \
  ./mach xpcshell-test browser/components/modal/tests/unit
MOZBUILD_STATE_PATH=/tmp/mozbuild ./mach mochitest --headless browser/components/modal/tests/browser
MOZBUILD_STATE_PATH=/tmp/mozbuild ./mach lint --warnings --linter eslint --linter stylelint browser/components/modal
```

For scoped documentation builds, Sphinx can generate HTML successfully while
`mach doc` exits nonzero: its warning check counts references to documentation
trees omitted by the scope. Inspect the log for warnings naming the changed page
and report HTML generation separately from the warning-check result.

Preferences tests must use the Downloads integration's temporary-directory
override, not create directories in the host's read-only home. Await actual
focus/find/scroll completion in tests. Border widths are device-pixel rounded;
do not assume a CSS `1px` border computes to exactly `1px` on X11.

### Native Linux keyboard checks

`xdotool` and Xvfb work in this sandbox. Firefox's
`EventUtils.synthesizeNativeKey` does not support Linux, and ordinary synthetic
key tests do not validate OS routing. The opt-in `browser_modal_native.js` test
uses XTest and is skipped by headless runs.

Start a session-local Xvfb on a free display, with TCP listening disabled, or use
an existing session display. For a running `:99` display:

```sh
env -u MOZ_HEADLESS DISPLAY=:99 GDK_BACKEND=x11 MOZ_ENABLE_WAYLAND=0 \
  HJKLFOX_NATIVE_KEYS=1 MOZBUILD_STATE_PATH=/tmp/mozbuild \
  ./mach mochitest browser/components/modal/tests/browser
```

This runs the whole suite on X11, including native injection. Serialize browser
test runs: the harness uses shared server ports. Bare Xvfb has no window manager,
so use `xdotool windowfocus`, not `windowactivate`. Send keys without `--window`,
which would select XSendEvent rather than XTest. Target only this test browser's
PID/window: `xdotool search` defaults to OR, so use `--all` when combining PID
and title criteria. The native test verifies a unique match and waits for real
key-release events. Stop Xvfb if the session started it.

If display startup fails, inspect the actual socket error rather than assuming a
display collision. The previous `socket(AF_UNIX, SOCK_STREAM)` permission failure
has been resolved; a recurrence requires operator help, not a transport workaround.
