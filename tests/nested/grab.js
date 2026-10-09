
// The popup must never keep the keyboard grab (#200, #250) and Super+W must close
// what it opened, even when confirm is bound to the same key (#265).
function scenario(ext, T) {
    const settings = ext.getSettings();
    const timeoutBefore = settings.get_int('popup-timeout');
    const ow = () => ext.overrideWorkspace;
    const NORMAL = 1;

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
    ];
}
