# About this fork

This fork of [mzur/gnome-shell-wsmatrix](https://github.com/mzur/gnome-shell-wsmatrix) keeps Workspace Matrix working on current GNOME (51) and carries fixes and features that upstream doesn't have yet. Install instructions are in the [README](README.md#this-fork-recommended).

## What's different from upstream

**Fixes**

- Runs on GNOME 51. The popup no longer crashes on the removed `St.BoxLayout` `vertical` property.
- <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>Shift</kbd>+arrow (move window) works again after the extension is disabled and re-enabled.
- No slowdown over time: each popup leaked its wallpaper (#302).
- The popup no longer disappears or freezes when you press keys quickly (#308).
- Enabling the extension no longer piles windows onto one workspace when it removes surplus workspaces (#328).
- In the overview, clicking or dropping a window on any grid row picks that row (#259, #274). The thumbnail strip is tall enough for every row, rows have spacing, and the highlight moves straight to the new thumbnail.
- In the overview, switching rows moves straight to the target. Other rows no longer draw over the thumbnails or the dash, and window previews in other rows keep their size.
- Vertical switch animations start in the right place. Before, they started slightly off and logged a NaN warning unless the switch started on workspace 0.
- The popup never keeps the keyboard grab, so a window always has focus after a switch (#200, #250).
- <kbd>Super</kbd>+<kbd>W</kbd> closes the popup it opened, even when confirm is bound to the same keys (#265).
- With popups on several monitors, the mouse works in the primary monitor's popup, and clicking outside closes them all (#224, #253).
- Popups are closed when monitors change, so unplugging a monitor doesn't leave stale thumbnails behind (#257, still needs testing on real hardware). Disabling restores the workspace layout that was set before (#216).
- The shell no longer logs an "Unmatched call to unblockWorkspaceUpdates()" warning on every switch, and the overview no longer schedules a redraw on every layout pass.

**Features**

- Restyled popup: a frosted, blurred background; a highlight ring that slides between cells; dots on empty workspaces; labels in your accent colour; and an entrance animation. Reduced motion is respected.
- Touchpad scrolling on the popup moves one cell at a time in both directions.
- <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>1</kbd>…<kbd>9</kbd> opens a cell and <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>1</kbd>…<kbd>9</kbd> moves the focused window there. GNOME's own Super+Ctrl+number keys open app windows, so these use the extension's Ctrl+Alt family.
- <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>BackSpace</kbd> goes back to the previous workspace, like Alt+Tab for workspaces.
- The Activities button shows the grid as dots in the shell's own style (a pill marks the active workspace and glides between cells, workspaces with windows are brighter, larger grids shrink to fit the bar, dots scale in and out when the grid changes, and screen readers hear the position) instead of a single row. Scroll over it to move through the grid. It can be turned off in preferences.
- Three- and four-finger swipes move along the current row. Moving along the column is optional, under "Switch rows with vertical touchpad swipes".

**Internals**

- GNOME's classes are subclassed (`MonitorGroup`) or their methods wrapped with `InjectionManager`, calling the original, instead of being copied. Copies go stale on every GNOME release, which is what broke the extension on 51.
- Signals use `connectObject`/`disconnectObject`; the extension logs through `getLogger()`; hover uses `Clutter.MotionController`.
- Automated checks run in a nested shell: see [TESTING.md](TESTING.md).

## Keeping up with upstream

```bash
git fetch upstream
git log --oneline master..upstream/master   # what's new
git merge upstream/master                   # resolve conflicts, then run `make check`
```

Merge upstream fixes as they land. Where a fix overlaps one of ours, keep whichever wraps GNOME's code rather than copying it.

## Changes in other forks

We surveyed the active forks on 2026-10-09. Look here before surveying again.

| Fork / branch | Status | Why |
|---|---|---|
| klaudiusk `grid-fixes-gnome50` (upstream #330) | Ported | Overview grid fixes, rewritten to wrap GNOME methods instead of copying `_adjustSpacingAndPadding` and others. |
| ggand0 `fix/reduce-gpu-usage` | Partly taken | Took the redraw scheduling fix. Skipped the `style-changed` guard: the popup starts with spacing 0, so a theme with spacing 0 would never draw it. Skipped lazy wallpaper creation; our #302 fix already frees wallpapers, so only revisit if idle GPU use is measured as a problem. |
| ettavolt `gnome-51` (upstream #332) | Covered | We already had the 51 support. Its spelling change to `global.workspace_manager` was cosmetic; GJS accepts both. |
| myyc `swipe-gestures` (upstream #323) | Ported | Rewritten to wrap GNOME's swipe handlers and mute GNOME's tracker instead of destroying and rebuilding it. Vertical swipes are opt-in. |
| myyc, DidelotK, sanwablo, mainland: overview drag/click branches | Skipped | Older versions of the overview fixes we have. Upstream #312 reports a regression when clicking empty workspaces. |
| jkubos `fix/disposed-monitorgroup-guards` | Optional | Stops "already disposed" errors from late callbacks. Our finish-the-running-switch fix probably removes the cause; add it only if those errors show up in the journal. |
| fkeglevich `force-horizontal-scroll-issue-230` (upstream #310) | Optional | A setting that maps vertical scrolling to left/right. Small, but it rewrites the scroll handler. |
| jtzero `do-not-animate-on-three-touch-lateral-swipe` (upstream #298) | Skipped | Guesses a swipe from a missing input event, leaves a debug log in and calls its completion step twice. Our swipe handling replaces it. |
| fabifont `master` (upstream #326, closed) | Skipped | About 1,270 lines: panel indicator, workspace groups, renaming, reordering. Too big, and upstream declined it. |
| JRPdata `modifier-release` | Skipped | Hardcodes Ctrl and Alt and ignores the user's shortcuts. Our #308 fix already closes the popup on release. |
| sajlx `master` | Skipped | The new wrap mode is buggy: a missing `break` falls through into it, and the upward boundary check is wrong. |
| appositeit, tadanagao, esauvisky | Skipped | Stale, niche, or a personal preference (removing the Super+W shortcut). |
