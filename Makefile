UUID=wsmatrix@martin.zurowietz.de

default: clean schemas zip

clean:
	find -name 'gschemas.compiled' -o -name $(UUID).zip -delete

zip:
	cd $(UUID) && zip -r ../$(UUID).zip *

schemas:
	find -name 'schemas' -type d -exec glib-compile-schemas {} \;

# Run a nested GNOME Shell window with the freshly built extension (needs mutter-devkit).
test: default
	gnome-extensions install --force $(UUID).zip
	MUTTER_DEBUG_DUMMY_MODE_SPECS=1600x900 dbus-run-session gnome-shell --devkit --wayland

# Run every automated scenario in tests/nested.
check:
	@set -e; for s in popup scroll grab cycle overview swipe features; do echo "== $$s"; tests/nested/run.sh $$s; done
	@echo "== multimonitor"; MONITORS=2 tests/nested/run.sh multimonitor

# Render the Activities grid in a few states and open the picture.
look:
	@out=$$(mktemp -d -t wsmatrix-look-XXXX); OUT=$$out tests/nested/run.sh look >/dev/null; \
	python3 tests/nested/montage.py $$out/shots | xargs -r xdg-open
