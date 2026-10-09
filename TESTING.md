# Testing

## Automated checks

`make check` runs each scenario in `tests/nested/` in a nested GNOME Shell window and prints PASS or FAIL for each check. To run one scenario: `tests/nested/run.sh overview`.

| Scenario | Checks |
|---|---|
| `popup` | Keyboard switching and rapid key presses |
| `scroll` | Touchpad scrolling on the open popup |
| `grab` | The popup never keeps the keyboard grab, and Super+W closes what it opened (#200, #250, #265) |
| `cycle` | Switching after disable and re-enable (what lock and unlock do); disable restores the layout and leaves a working overview (#216, #179) |
| `overview` | Drop targets and clicks on every row, strip height, which rows are shown and clipped, app grid |
| `swipe` | Horizontal and vertical swipes, the popup after a swipe, restoring GNOME's gestures |
| `features` | Ctrl+Alt+number and Ctrl+Alt+BackSpace through a virtual keyboard; the top-bar grid map |
| `multimonitor` | Run with `MONITORS=2`: one grab for all popups, closing one closes all, overview grid on the second monitor (#224, #253, #255) |

Requirements:

- the `mutter-devkit` package;
- the extension enabled, with a grid of at least 2×2;
- the installed extension must not be a symlink to your checkout. The runner refuses to run if it is, because installing over a symlink replaces the source.

The runner installs a test build over the installed extension and puts the normal build back afterwards. The shell you're logged into keeps running the code it loaded at login. Screenshots and the shell log go to a temporary folder printed at the end.

Keep the nested window visible while a run is going. Animations only advance while it draws frames, so a hidden window can make timing-based checks fail.

Swipes are simulated by emitting the swipe trackers' signals, so real touchpad feel still needs the manual checks below.

## Manual checks

Run these after logging back in on a new build.

**Popup** (<kbd>Ctrl</kbd>+<kbd>Alt</kbd>+arrows)

1. The popup fades in with a slight zoom, on a frosted, blurred background.
2. The highlight ring slides to the new cell, and the other cells are slightly dimmed.
3. Empty workspaces show a small dot.
4. With workspace names on, the selected label uses your accent colour.
5. Holding <kbd>Ctrl</kbd>+<kbd>Alt</kbd> and tapping arrows quickly keeps the popup up and following.
6. <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>Shift</kbd>+arrow moves the focused window.
7. Scrolling on the open popup moves one cell at a time, in both directions.
8. With "Enable workspace hover" on, hovering selects a cell.
9. <kbd>Alt</kbd>+<kbd>Tab</kbd> keeps GNOME's stock look.

**Swipes**

10. A three-finger left or right swipe moves within the row, follows your fingers, and shows the popup.
11. Swiping again straight away works.
12. With "Switch rows with vertical touchpad swipes" on, up and down swipes move between rows and swipe-up no longer opens the overview. Turning it off restores swipe-up.

**Overview** (<kbd>Super</kbd>)

13. The thumbnails form a full grid with gaps between rows, and no row is cut off.
14. Clicking a lower-row thumbnail opens that workspace.
15. Dragging a window onto a lower-row thumbnail moves it there.
16. <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>Down</kbd> moves the view straight down, without drawing other rows over the thumbnails or the dash.
17. After switching rows, window previews keep their size. The automated checks can't cover this because the test shell has no windows.
18. In the app grid, the workspace grid shrinks above the apps and the icons don't overlap.

**Over a day of use**

19. After locking and unlocking (<kbd>Super</kbd>+<kbd>L</kbd>), the switcher and swipes still work, and a swipe isn't handled twice.
20. The popup doesn't get slower over time.
21. Windows stay on their workspaces after unlocking.
22. With Settings → Accessibility → Reduce Animation on, the popup fades without zooming or sliding.

**Shortcuts and the top-bar map**

25. <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>1</kbd>…<kbd>9</kbd> opens that cell; add <kbd>Shift</kbd> to move the focused window there.
26. <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>BackSpace</kbd> goes back to the previous workspace, and pressing it again returns.
27. The grid next to Activities shows the active cell in your accent colour and fills cells that have windows. Clicking a cell opens it, and scrolling over the grid moves through it.

**Second monitor**

23. Unplug the external monitor while the Super+W popup is open, then keep switching for a minute. GNOME Shell must not crash (#257). The nested shell can't test this: mutter itself crashes when its virtual monitors are reconfigured.
24. With "Show popup for all monitors" on, the mouse selects workspaces in the primary monitor's popup, and clicking outside closes the popups on every monitor.

If anything fails, include `journalctl --user -b -g wsmatrix` in the report.
