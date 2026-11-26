# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

modal-mode-command = Command
modal-mode-insert = Insert
modal-mode-address = Address bar
modal-mode-search = Page search
# $count is the number of selected tabs.
modal-mode-select = Tab selection ({ $count } selected)
modal-hints-title = Page hints
modal-hints-new-tab-title = Open a link in a new tab
modal-hint-button = Button
modal-hint-editor = Editable field
# $count is the number of available page hints; $prefix is the letters typed.
modal-mode-hints = Hints ({ $count }): { $prefix }
# $count is the number of available link hints; $prefix is the letters typed.
modal-mode-hints-new-tab = New-tab hints ({ $count }): { $prefix }

modal-urlbar-destinations = Enter an address or search the web. Suggestions also include history and bookmarks. Alt-J and Alt-K send Down and Up arrows to select suggestions; Alt-H and Alt-L send Left and Right arrows to move the caret. Enter accepts the selected suggestion or submits your input.
modal-urlbar-history = Find a match in history. Alt-J and Alt-K select suggestions; Alt-H and Alt-L move the caret. Enter opens the selected or first match.
modal-urlbar-bookmarks = Find a bookmark. Alt-J and Alt-K select suggestions; Alt-H and Alt-L move the caret. Enter opens the selected or first match.
modal-urlbar-tabs = Find an open tab. Alt-J and Alt-K select suggestions; Alt-H and Alt-L move the caret. Enter switches to the selected or first matching tab.
modal-urlbar-engines = Choose a search engine without clearing your query. Alt-J and Alt-K select an engine, Enter confirms. Alt-H and Alt-L move the caret. Typing edits your query. Control-Space cancels engine selection. Escape leaves the address bar.

modal-newtab-title = Keyboard shortcut reference
modal-newtab-intro = Press Escape to leave the address bar. Shortcuts apply in command mode unless their section names another mode. Click a text field or enter insert mode to type normally. Escape returns to command mode.
modal-newtab-tip = Keys separated by spaces are pressed in sequence. Ctrl and Alt mean hold Control or Alt while pressing the key. For uppercase letters, hold Shift. Add a number before scrolling or switching tabs to repeat the action.
modal-newtab-customized = This guide follows your current bindings, including changes to browser.modal.keybindings in about:config.

modal-newtab-group-address = Address-bar navigation
modal-newtab-group-address-input = While editing the address bar
modal-newtab-group-editing = Editing
modal-newtab-group-insert = While in insert mode
modal-newtab-group-scrolling = Scrolling
modal-newtab-group-navigation = Tabs and history
modal-newtab-group-tab-selection = While selecting tabs
modal-newtab-group-find = Page search
modal-newtab-group-hints = Link and button hints
modal-newtab-group-other = Other shortcuts

# $prefix is the key sequence entered so far, such as "Space" or "g".
modal-key-completions-title = { $prefix } — complete a shortcut
modal-key-completions-cancel = Escape to cancel

modal-clipboard-invalid-url = Clipboard does not contain a valid URL.
modal-clipboard-read-error = Could not read the clipboard.
modal-clipboard-copy-error = Could not copy the page URL.
modal-clipboard-open-error = Could not open the clipboard URL.
modal-shortcut-clipboard-copy-url = Copy the current page URL
modal-shortcut-clipboard-open-url = Open the clipboard URL in a new tab
modal-shortcut-clipboard-open-url-current = Open the clipboard URL in the current tab

modal-shortcut-key-left = Send Left arrow to the page
modal-shortcut-key-down = Send Down arrow to the page
modal-shortcut-key-up = Send Up arrow to the page
modal-shortcut-key-right = Send Right arrow to the page
modal-shortcut-scroll-half-up = Scroll half a page up
modal-shortcut-scroll-half-down = Scroll half a page down
modal-shortcut-scroll-page-down = Scroll a page down
modal-shortcut-scroll-page-up = Scroll a page up
modal-shortcut-scroll-start = Go to the top of the page
modal-shortcut-scroll-end = Go to the bottom of the page
modal-shortcut-scroll-left-edge = Go to the left edge
modal-shortcut-scroll-right-edge = Go to the right edge
modal-shortcut-find-open = Edit a page search; Enter submits it
modal-shortcut-find-next = Next submitted search match
modal-shortcut-find-previous = Previous submitted search match
modal-shortcut-tab-next = Next tab
modal-shortcut-tab-previous = Previous tab
modal-shortcut-tab-history-back = Back in tab history
modal-shortcut-tab-history-forward = Forward in tab history
modal-shortcut-tab-new = Open a new tab
modal-shortcut-tab-new-before = Open a new tab before the current tab
modal-shortcut-tab-reopen = Reopen the last closed tab
modal-shortcut-tab-close = Close the selected tabs
modal-shortcut-tab-pin = Pin the selected tabs
modal-shortcut-tab-unpin = Unpin the selected tabs
modal-shortcut-tab-mute = Mute the current tab
modal-shortcut-tab-unmute = Unmute the current tab
modal-shortcut-tab-select = Enter tab selection mode; Escape keeps the selection
modal-shortcut-tab-deselect = Deselect all tabs except the current tab
modal-shortcut-selection-next = Move the tab-selection cursor forward
modal-shortcut-selection-previous = Move the tab-selection cursor backward
modal-shortcut-selection-first = Select the range from the anchor to the first tab
modal-shortcut-selection-last = Select the range from the anchor to the last tab
modal-shortcut-split-new = Create a split view and search for its second tab
modal-shortcut-split-separate = Separate the tabs in the current split view
modal-shortcut-history-back = Back in history
modal-shortcut-history-forward = Forward in history
modal-shortcut-hint-follow = Follow a link or activate a button using its label
modal-shortcut-hint-follow-new-tab = Open a link in a new tab using its label
modal-shortcut-mode-insert = Enter insert mode to type on the page
modal-shortcut-urlbar-destinations = Clear and focus the address bar
modal-shortcut-urlbar-edit = Focus the address bar without clearing its text
modal-shortcut-urlbar-history = Start a new history search in the address bar
modal-shortcut-urlbar-bookmarks = Start a new bookmark search in the address bar
modal-shortcut-bookmark-add = Add or edit a bookmark for the current tab
modal-shortcut-urlbar-tabs = Start a new open-tab search in the address bar
modal-shortcut-urlbar-search = Start a new search with the default search engine
modal-shortcut-address-left = Send Left arrow to move the address-bar caret
modal-shortcut-address-down = Send Down arrow to select the next suggestion
modal-shortcut-address-up = Send Up arrow to select the previous suggestion
modal-shortcut-address-right = Send Right arrow to move the address-bar caret
modal-shortcut-address-engines = Open or close the engine picker without clearing your query

modal-shortcut-tab-group-next = Next tab within the current group
modal-shortcut-tab-group-previous = Previous tab within the current group
modal-shortcut-tab-move-next = Move the selected tabs forward
modal-shortcut-tab-move-previous = Move the selected tabs backward
modal-shortcut-tab-group-move-next = Move the selected tabs forward within their groups, wrapping at the end
modal-shortcut-tab-group-move-previous = Move the selected tabs backward within their groups, wrapping at the start
modal-shortcut-tab-first = Switch to the first tab
modal-shortcut-tab-last = Switch to the last tab
modal-shortcut-tab-move-first = Move the selected tabs to the beginning of the tab strip
modal-shortcut-tab-move-last = Move the selected tabs to the end of the tab strip
modal-shortcut-tab-group-first = Switch to the first tab within the current group
modal-shortcut-tab-group-last = Switch to the last tab within the current group
modal-shortcut-tab-group-move-first = Move the selected tabs to the beginning of their groups
modal-shortcut-tab-group-move-last = Move the selected tabs to the end of their groups
modal-shortcut-group-new = Create a named group with the selected tabs
modal-shortcut-group-move = Move the selected tabs to a group
modal-shortcut-group-ungroup = Remove the selected tabs from their groups
modal-shortcut-group-select = Select all tabs in the current group
modal-shortcut-group-fold = Fold the current group
modal-shortcut-group-unfold = Unfold the current group
modal-shortcut-group-edit = Edit the current group’s name and colour
modal-urlbar-group-move = Find a destination group in this window. Alt-J and Alt-K select suggestions; Alt-H and Alt-L move the caret. Enter moves the selected tabs. Escape cancels.
modal-group-pinned = Unpin this tab before adding it to a group.
# $name is the group name; $count is its number of tabs.
modal-group-result =
    { $count ->
        [one] { $name } — { $count } tab
       *[other] { $name } — { $count } tabs
    }
# $name is the group name; $count is its number of tabs.
modal-group-folded-result =
    { $count ->
        [one] { $name } — { $count } tab (folded)
       *[other] { $name } — { $count } tabs (folded)
    }
# $title is a tab title; $name is its group name.
modal-tab-group-result = { $title } — { $name }
# $title is a tab title; $name is its group name.
modal-tab-folded-result = { $title } — { $name } (folded)
# $position is the active tab’s one-based position; $count is the group size.
modal-group-position = { $position }/{ $count }
    .tooltiptext = Tab { $position } of { $count }
    .aria-description = Tab { $position } of { $count }
