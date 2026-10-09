#!/bin/bash
# Runs one scenario in a nested GNOME Shell and reports PASS/FAIL.
# Usage: tests/nested/run.sh <popup|scroll|cycle|overview|swipe>
# Temporarily installs a test build over the installed extension and restores the
# normal build afterwards. Needs mutter-devkit and the extension to be enabled.
set -euo pipefail
cd "$(dirname "$0")/../.."

NAME=${1:?usage: $0 <popup|scroll|cycle|overview|swipe>}
UUID=wsmatrix@martin.zurowietz.de
DIR=tests/nested
INSTALLED="$HOME/.local/share/gnome-shell/extensions/$UUID"
# Installing over a symlinked dev checkout would replace (and lose) the source.
[ -L "$INSTALLED" ] && { echo "$INSTALLED is a symlink; remove it before running tests" >&2; exit 2; }
[ -f "$DIR/$NAME.js" ] || { echo "no scenario $DIR/$NAME.js" >&2; exit 2; }
OUT=${OUT:-$(mktemp -d -t wsmatrix-test-XXXX)}
mkdir -p "$OUT/ext" "$OUT/shots"

make -s >/dev/null
unzip -q -o "$UUID.zip" -d "$OUT/ext"
sed "s|@OUT@|$OUT|" "$DIR/prelude.js" >> "$OUT/ext/extension.js"
cat "$DIR/$NAME.js" >> "$OUT/ext/extension.js"
(cd "$OUT/ext" && zip -qr ../test.zip .)

# The nested shell exits before the shell's start-up crash guard clears its marker;
# a leftover marker makes the next shell start (nested or the real session) disable
# all extensions.
CRASH_GUARD="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/gnome-shell-disable-extensions"
trap 'gnome-extensions install --force "$UUID.zip"; rm -f "$CRASH_GUARD"' EXIT
rm -f "$CRASH_GUARD"
gnome-extensions install --force "$OUT/test.zip"
# Headless: no window on the desktop, and frames don't stall when nothing shows it.
# MONITORS=2 adds a second virtual monitor for the multi-monitor scenarios.
monitors=(--virtual-monitor 1600x900)
[ "${MONITORS:-1}" -ge 2 ] && monitors+=(--virtual-monitor 1280x800)
timeout "${TIMEOUT:-30}" dbus-run-session gnome-shell --headless --wayland --no-x11 \
    --wayland-display "wsmatrix-test-$$" "${monitors[@]}" > "$OUT/shell.log" 2>&1 || true

grep -o 'WSMTEST .*' "$OUT/shell.log" | sed 's/^WSMTEST //' || true
# JS errors whose stack points into the extension (the shell logs unrelated ones too).
errors=$(grep -A4 -E 'JS (ERROR|WARNING)' "$OUT/shell.log" | grep -c "$UUID" || true)
fails=$(grep -cE 'WSMTEST (FAIL|ERR)' "$OUT/shell.log" || true)
grep -q 'WSMTEST DONE' "$OUT/shell.log" || { echo "FAIL: scenario did not finish (log: $OUT/shell.log)"; exit 1; }
echo "screenshots: $OUT/shots  log: $OUT/shell.log"
if [ "$errors" -gt 0 ] || [ "$fails" -gt 0 ]; then
    echo "FAIL: $fails failed checks, $errors extension JS errors"
    exit 1
fi
echo OK
