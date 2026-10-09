import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import St from 'gi://St';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';

const CELL_SPACING = 2;

// Top-bar map of the workspace grid: the active cell is highlighted and cells with
// windows are filled. Click a cell to switch to it; scroll to move through the grid.
export default GObject.registerClass(
class GridIndicator extends PanelMenu.Button {
    _init(manager) {
        super._init(0.5, 'Workspace Matrix', true);
        this._manager = manager;
        this._grid = new St.Widget({
            style_class: 'wsmatrix-panel-grid',
            layout_manager: new Clutter.GridLayout({row_spacing: CELL_SPACING, column_spacing: CELL_SPACING}),
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.add_child(this._grid);

        const scroll = new Clutter.ScrollController({
            flags: Clutter.ScrollControllerFlags.DISCRETE |
                Clutter.ScrollControllerFlags.SCROLL_VERTICAL |
                Clutter.ScrollControllerFlags.SCROLL_HORIZONTAL,
        });
        scroll.connect('scroll', (_c, _sprite, _source, dx, dy) => this._onScroll(dx, dy));
        this.add_action(scroll);

        const workspaceManager = global.workspace_manager;
        workspaceManager.connectObject(
            'notify::n-workspaces', () => this.rebuild(),
            'active-workspace-changed', () => this._update(),
            this);
        this._workspaces = [];
        this.rebuild();
    }

    rebuild() {
        this._grid.destroy_all_children();
        this._workspaces.forEach(w => w.disconnectObject(this));
        const workspaceManager = global.workspace_manager;
        const columns = workspaceManager.layout_columns;
        const layout = this._grid.layout_manager;

        this._cells = [];
        this._workspaces = [];
        for (let i = 0; i < workspaceManager.n_workspaces; i++) {
            const workspace = workspaceManager.get_workspace_by_index(i);
            this._workspaces.push(workspace);
            const cell = new St.Button({style_class: 'wsmatrix-panel-cell', can_focus: false});
            cell.connect('clicked', () => workspace.activate(global.get_current_time()));
            layout.attach(cell, i % columns, Math.floor(i / columns), 1, 1);
            workspace.connectObject(
                'window-added', () => this._update(),
                'window-removed', () => this._update(),
                this);
            this._cells.push(cell);
        }
        this._update();
    }

    _update() {
        const workspaceManager = global.workspace_manager;
        const active = workspaceManager.get_active_workspace_index();
        this._cells.forEach((cell, i) => {
            const occupied = this._workspaces[i].list_windows().some(w => !w.skip_taskbar);
            cell.style_class = 'wsmatrix-panel-cell' +
                (i === active ? ' active' : '') +
                (occupied ? ' occupied' : '');
        });
    }

    _onScroll(dx, dy) {
        const direction = Math.abs(dx) > Math.abs(dy)
            ? (dx > 0 ? Meta.MotionDirection.RIGHT : Meta.MotionDirection.LEFT)
            : (dy > 0 ? Meta.MotionDirection.DOWN : Meta.MotionDirection.UP);
        this._manager._getTargetWorkspace(direction).activate(global.get_current_time());
        return Clutter.EVENT_STOP;
    }

    _onDestroy() {
        global.workspace_manager.disconnectObject(this);
        this._workspaces.forEach(w => w.disconnectObject(this));
        super._onDestroy();
    }
});
