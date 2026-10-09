
// The popup must never keep the keyboard grab (#200, #250) and Super+W must close
// what it opened, even when confirm is bound to the same key (#265).
function scenario(ext, T) {
    const settings = ext.getSettings();
    const timeoutBefore = settings.get_int('popup-timeout');
    const ow = () => ext.overrideWorkspace;
    const NORMAL = 1;
    const Clutter = imports.gi.Clutter;
    let keyboard;
    const press = (...names) => {
        keyboard ??= global.stage.context.get_backend().get_default_seat()
            .create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
        const keyvals = names.map(n => Clutter[`KEY_${n}`]);
        keyvals.forEach(k => keyboard.notify_keyval(GLib.get_monotonic_time(), k, Clutter.KeyState.PRESSED));
        keyvals.reverse().forEach(k => keyboard.notify_keyval(GLib.get_monotonic_time(), k, Clutter.KeyState.RELEASED));
    };

    return [
        [2500, () => settings.set_int('popup-timeout', 0)],
        // A switch without a key event (as during a drag) has no modifiers to release.
        [3000, () => T.switch('right')],
        [4500, () => T.expect('popup closes without a timeout or modifiers', !!T.popup(), false)],
        [4550, () => T.expect('keyboard grab is released', T.main.actionMode, NORMAL)],
        [5000, () => ow()._showWorkspaceSwitcherPopup(true)],
        [5500, () => T.popup()._keyPressHandler(0, ow()._toggleAction)],
        [6200, () => T.expect('the toggle shortcut closes the toggle popup', !!T.popup(), false)],
        [6250, () => T.expect('keyboard grab is released after toggle', T.main.actionMode, NORMAL)],
        [6500, () => settings.set_int('popup-timeout', timeoutBefore)],
        // The same through real key presses: Super+W opens with the grab, each key closes.
        ...[['Escape'], ['Return'], ['Super_L', 'w']].flatMap((keys, n) => {
            const t = 7000 + n * 2000;
            return [
                [t, () => press('Super_L', 'w')],
                [t + 600, () => T.expect('Super+W opens a popup holding the grab',
                    [!!T.popup(), T.popup()?._haveModal], [true, true])],
                [t + 700, () => press(...keys)],
                [t + 1400, () => T.expect(`${keys.join('+')} closes it`, !!T.popup(), false)],
            ];
        }),
    ];
}
