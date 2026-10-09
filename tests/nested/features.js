
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
    const indicator = () => T.main.panel.statusArea['wsmatrix-grid'];
    const settings = ext.getSettings();

    return [
        [2500, () => {
            T.expect('the grid map is in the top bar', !!indicator(), true);
            T.expect('one cell per workspace', indicator()._cells.length, global.workspace_manager.n_workspaces);
        }],
        [3000, () => press('Control_L', 'Alt_L', '5')],
        [3600, () => T.expect('Ctrl+Alt+5 opens cell 5', T.active(), 4)],
        [3700, () => T.expect('the map highlights the active cell',
            indicator()._cells.map(cell => cell.has_style_class_name('active')).indexOf(true), 4)],
        [4000, () => press('Control_L', 'Alt_L', '2')],
        [4600, () => T.expect('Ctrl+Alt+2 opens cell 2', T.active(), 1)],
        [5000, () => press('Control_L', 'Alt_L', 'BackSpace')],
        [5600, () => T.expect('Ctrl+Alt+BackSpace goes back', T.active(), 4)],
        [6000, () => press('Control_L', 'Alt_L', 'BackSpace')],
        [6600, () => T.expect('and back again', T.active(), 1)],
        [7000, () => indicator()._cells[c].emit('clicked', 1)],
        [7500, () => T.expect('clicking a map cell opens it', T.active(), c)],
        [7600, () => indicator()._onScroll(1, 0)],
        [8100, () => T.expect('scrolling the map moves through the grid', T.active(), c + 1)],
        [8200, () => T.shot('panel-map')],
        [8500, () => settings.set_boolean('show-panel-indicator', false)],
        [8700, () => T.expect('the map can be turned off', !!indicator(), false)],
        [9000, () => settings.set_boolean('show-panel-indicator', true)],
        [9200, () => T.expect('and back on', !!indicator(), true)],
    ];
}
