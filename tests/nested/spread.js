
// Popup cells spread out the windows of workspaces with more than one, like the overview.
// Opens real windows: small GTK 4 windows started from inside the nested shell, so they
// connect to its display.
function scenario(ext, T) {
    const settings = ext.getSettings();
    const procs = [];
    const open = title => procs.push(Gio.Subprocess.new(['gjs', '-c', `
        imports.gi.versions.Gtk = '4.0';
        const {Gtk, GLib} = imports.gi;
        Gtk.init();
        new Gtk.Window({title: '${title}', default_width: 900, default_height: 600}).present();
        new GLib.MainLoop(null, false).run();`], Gio.SubprocessFlags.NONE));
    const window = title => global.get_window_actors()
        .map(a => a.meta_window).find(w => w.get_title() === title);
    const Clutter = imports.gi.Clutter;
    const openPopup = () => ext.overrideWorkspace._showWorkspaceSwitcherPopup(true);
    const closePopup = () => ext.overrideWorkspace._destroyWorkspaceSwitcherPopup();
    const cells = () => T.popup()._items;
    // What a cell is showing: a spread workspace or a plain thumbnail.
    const content = i => cells()[i].view ?? cells()[i];
    const kind = i => content(i).constructor.name;
    // Moves a window with the extension's own Ctrl+Alt+Shift+arrow path.
    const move = (title, dir) => ext.overrideWorkspace._showWorkspaceSwitcher(
        global.display, window(title), null, `move-to-workspace-${dir}`);
    // How much of its button a cell's content covers, side to side.
    const fill = i => content(i).get_transformed_size()[0] / buttons()[i].get_transformed_size()[0];
    const buttons = () => T.popup()._switcherList._items;
    const overlap = (a, b) => a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;
    let delegates;

    return [
        [2200, () => ['A', 'B', 'C'].forEach(open)],
        [4500, () => {
            T.expect('test windows opened', ['A', 'B', 'C'].map(t => !!window(t)), [true, true, true]);
            window('C')?.change_workspace_by_index(1, false);
        }],
        [4700, () => T.expect('window C moved to workspace 2',
            window('C')?.get_workspace().index(), 1)],
        [4800, () => {
            delegates = ['A', 'B'].map(t => window(t)?._delegate);
            openPopup();
        }],
        [4850, () => T.expect('spread windows appear without growing in',
            content(0)._windows.map(p => [p.scale_x, p.scale_y]), [[1, 1], [1, 1]])],
        [5300, () => {
            T.expect('a workspace with two windows gets a spread cell', kind(0), 'SpreadWorkspace');
            T.expect('a workspace with one window keeps its thumbnail', kind(1), 'WorkspaceThumbnail');
            T.expect('an empty workspace keeps its dot', buttons()[2]._emptyDot.visible, true);
            T.shot('spread-popup');
        }],
        [5350, () => {
            const previews = content(0)._windows;
            T.expect('both windows are in the spread cell', previews.length, 2);
            const [a, b] = previews.map(p => p.get_allocation_box());
            T.expect('spread windows do not overlap', overlap(a, b), false);
            T.expect('each window shows its app icon',
                previews.map(p => p._icon.visible && p._icon.opacity > 0), [true, true]);
            T.expect('titles stay hidden', previews.map(p => p._title.visible), [false, false]);
        }],
        [5400, () => {
            // Clicks and hover belong to the cell's button, not to the windows inside it.
            const preview = content(0)._windows[0];
            const [x, y] = preview.get_transformed_position();
            const [w, h] = preview.get_transformed_size();
            const hit = global.stage.get_actor_at_pos(Clutter.PickMode.REACTIVE, x + w / 2, y + h / 2);
            T.expect('the cell button takes the pointer', buttons()[0].contains(hit), true);
            T.expect('nothing inside the spread cell takes the pointer', content(0).contains(hit), false);
        }],
        [5450, () => closePopup()],
        [5700, () => T.expect('windows get their drag-and-drop delegate back',
            ['A', 'B'].map(t => window(t)?._delegate === delegates.shift()), [true, true])],
        [5800, () => {
            openPopup();
            // Changing the setting closes the open popup, so the next one is rebuilt.
            settings.set_boolean('spread-windows', false);
        }],
        [5900, () => T.expect('turning the setting off closes the popup', !!T.popup(), false)],
        [6000, () => openPopup()],
        [6400, () => {
            T.expect('with the setting off the cell is a thumbnail', kind(0), 'WorkspaceThumbnail');
            closePopup();
            settings.set_boolean('spread-windows', true);
        }],
        // Moving windows while the popup is up changes which cells need spreading.
        [6600, () => {
            T.goTo(0);
            openPopup();
        }],
        [7000, () => T.expect('before the move: spread cell, then thumbnail', [kind(0), kind(1)],
            ['SpreadWorkspace', 'WorkspaceThumbnail'])],
        [7050, () => move('A', 'right')],
        [7600, () => {
            T.expect('a window moved onto a one-window workspace spreads that cell', kind(1), 'SpreadWorkspace');
            T.expect('the moved window is in the spread cell', content(1)._windows?.length, 2);
            T.expect('the workspace left with one window gets its thumbnail back', kind(0), 'WorkspaceThumbnail');
            T.expect('the moved window is gone from the cell it left',
                content(0)._windows.map(c => c.metaWindow.get_title()), ['B']);
            T.expect('the new spread cell is scaled to fit its button', fill(1) > 0.8 && fill(1) <= 1, true);
            T.shot('spread-after-move');
        }],
        [7700, () => move('A', 'left')],
        [8200, () => {
            T.expect('moving the window back swaps both cells back', [kind(0), kind(1)],
                ['SpreadWorkspace', 'WorkspaceThumbnail']);
            T.expect('the cell the window left back shows only its own window',
                content(1)._windows.map(c => c.metaWindow.get_title()), ['C']);
        }],
        // Carrying a window across several workspaces leaves no copy of it behind.
        [8250, () => move('A', 'right')],
        [8500, () => move('A', 'right')],
        [8750, () => move('A', 'right')],
        [9200, () => {
            T.expect('the carried window is only in the cell it ended up in',
                cells().map((_, i) => content(i)._windows.some(c => c.metaWindow.get_title() === 'A')),
                cells().map((_, i) => i === window('A')?.get_workspace().index()));
            closePopup();
            window('A')?.change_workspace_by_index(0, false);
        }],
        // A window on all workspaces is shown in every spread cell but doesn't count towards one.
        [9300, () => ['S', 'D'].forEach(open)],
        [11300, () => {
            window('D')?.change_workspace_by_index(1, false);
            window('S')?.stick();
        }],
        [11500, () => {
            delegates = [window('S')?._delegate];
            openPopup();
        }],
        [12000, () => {
            T.expect('two spread cells share the window on all workspaces', [kind(0), kind(1),
                content(0)._windows.length, content(1)._windows.length],
            ['SpreadWorkspace', 'SpreadWorkspace', 3, 3]);
            closePopup();
        }],
        [12300, () => T.expect('the window on all workspaces gets its delegate back',
            window('S')?._delegate === delegates[0], true)],
        [12400, () => {
            window('D')?.change_workspace_by_index(0, false);
            openPopup();
        }],
        [12900, () => {
            T.expect('a window on all workspaces does not make a cell spread', kind(1), 'WorkspaceThumbnail');
            closePopup();
        }],
        [13500, () => procs.forEach(p => p.force_exit())],
    ];
}
