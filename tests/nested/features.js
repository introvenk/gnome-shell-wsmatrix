
// Jump back to the last workspace, cell shortcuts and the top-bar grid map.
// Shortcuts are pressed through a virtual keyboard, so the real bindings are tested.
function scenario(ext, T) {
    const c = T.columns();
    const Clutter = imports.gi.Clutter;
    let keyboard;
    const press = (...names) => {
        keyboard ??= global.stage.context.get_backend().get_default_seat()
            .create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
        const keyvals = names.map(n => Clutter[`KEY_${n}`]);
        const now = () => GLib.get_monotonic_time();
        keyvals.forEach(k => keyboard.notify_keyval(now(), k, Clutter.KeyState.PRESSED));
        keyvals.reverse().forEach(k => keyboard.notify_keyval(now(), k, Clutter.KeyState.RELEASED));
    };
    const indicator = () => ext.overrideWorkspace._gridIndicator;
    const activities = () => T.main.panel.statusArea.activities;
    const brightest = () => {
        const opacities = indicator()._dots.map(d => d.opacity);
        return opacities.indexOf(Math.max(...opacities));
    };
    const settings = ext.getSettings();

    return [
        [2400, () => T.main.overview.hide()],
        [2500, () => {
            T.expect('the grid sits in the Activities button', indicator()?.get_parent() === activities(), true);
            T.expect("the shell's own dots are hidden", ext.overrideWorkspace._gridIndicator?._nativeDots.visible ?? T.main.panel.statusArea.activities.get_first_child().visible, false);
            T.expect('one dot per workspace', indicator()._dots.length, global.workspace_manager.n_workspaces);
        }],
        [3000, () => press('Control_L', 'Alt_L', '5')],
        [3100, () => T.shot('panel-gliding')],
        [3600, () => T.expect('Ctrl+Alt+5 opens cell 5', T.active(), 4)],
        [3700, () => T.expect('the active dot is the brightest', brightest(), 4)],
        [3750, () => T.shot('panel-grid')],
        [4000, () => press('Control_L', 'Alt_L', '2')],
        [4600, () => T.expect('Ctrl+Alt+2 opens cell 2', T.active(), 1)],
        [5000, () => press('Control_L', 'Alt_L', 'BackSpace')],
        [5600, () => T.expect('Ctrl+Alt+BackSpace goes back', T.active(), 4)],
        [6000, () => press('Control_L', 'Alt_L', 'BackSpace')],
        [6600, () => T.expect('and back again', T.active(), 1)],
        [7000, () => indicator()._onScroll(0, 1)],
        [7500, () => T.expect('scrolling the grid moves down a row', T.active(), 1 + c)],
        [8500, () => settings.set_boolean('show-panel-indicator', false)],
        [8700, () => {
            T.expect('the grid can be turned off', !!indicator(), false);
            T.expect("the shell's dots come back", ext.overrideWorkspace._gridIndicator?._nativeDots.visible ?? T.main.panel.statusArea.activities.get_first_child().visible, true);
        }],
        [9000, () => settings.set_boolean('show-panel-indicator', true)],
        [9200, () => T.expect('and back on', !!indicator(), true)],
    ];
}
