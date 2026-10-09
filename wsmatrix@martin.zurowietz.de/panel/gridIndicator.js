import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Graphene from 'gi://Graphene';
import Meta from 'gi://Meta';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

// Same look as the shell's own workspace dots (panel.js): inactive dots are smaller and
// dimmer, the active one is full size, and the highlight glides between them.
const INACTIVE_SCALE = 0.75;
const EMPTY_OPACITY = 0.35;
const OCCUPIED_OPACITY = 0.6;
const GLIDE_TIME = 250;

// The workspace grid drawn inside the Activities button in place of the shell's row of
// dots. Clicking still opens the overview; scrolling moves through the grid.
export default GObject.registerClass(
class GridIndicator extends St.Widget {
    _init(manager) {
        super._init({
            style_class: 'wsmatrix-panel-grid',
            layout_manager: new Clutter.GridLayout(),
            y_align: Clutter.ActorAlign.CENTER,
            reactive: true,
        });
        this._manager = manager;
        this._workspaces = [];
        this._dots = [];

        // Carries the highlight position (column, row) as translation so it can be eased.
        this._glide = new Clutter.Actor({visible: false});
        this._glide.connect('notify::translation-x', () => this._updateDots());
        this._glide.connect('notify::translation-y', () => this._updateDots());
        this.add_child(this._glide);

        const scroll = new Clutter.ScrollController({
            flags: Clutter.ScrollControllerFlags.DISCRETE |
                Clutter.ScrollControllerFlags.SCROLL_VERTICAL |
                Clutter.ScrollControllerFlags.SCROLL_HORIZONTAL,
        });
        scroll.connect('scroll', (_c, _sprite, _source, dx, dy) => this._onScroll(dx, dy));
        this.add_action(scroll);

        global.workspace_manager.connectObject(
            'notify::n-workspaces', () => this.rebuild(),
            'active-workspace-changed', () => this._glideToActive(true),
            this);

        const activities = Main.panel.statusArea.activities;
        this._nativeDots = activities.get_first_child();
        this._nativeDots.hide();
        // The button lays out only its first child.
        activities.insert_child_at_index(this, 0);
        this.connect('style-changed', () => this._applySpacing());
        this.connect('destroy', () => {
            global.workspace_manager.disconnectObject(this);
            this._workspaces.forEach(w => w.disconnectObject(this));
            this._nativeDots.show();
        });
        this.rebuild();
    }

    _applySpacing() {
        const node = this.get_theme_node();
        this.layout_manager.row_spacing = node.get_length('-wsmatrix-row-spacing');
        this.layout_manager.column_spacing = node.get_length('-wsmatrix-column-spacing');
    }

    rebuild() {
        this._dots.forEach(d => d.destroy());
        this._workspaces.forEach(w => w.disconnectObject(this));
        const workspaceManager = global.workspace_manager;
        const columns = workspaceManager.layout_columns;

        this._dots = [];
        this._workspaces = [];
        for (let i = 0; i < workspaceManager.n_workspaces; i++) {
            const workspace = workspaceManager.get_workspace_by_index(i);
            workspace.connectObject(
                'window-added', () => this._updateDots(),
                'window-removed', () => this._updateDots(),
                this);
            const dot = new St.Widget({
                style_class: 'wsmatrix-panel-dot',
                pivot_point: new Graphene.Point({x: 0.5, y: 0.5}),
            });
            this.layout_manager.attach(dot, i % columns, Math.floor(i / columns), 1, 1);
            this._workspaces.push(workspace);
            this._dots.push(dot);
        }
        this._glideToActive(false);
    }

    _glideToActive(animate) {
        const columns = global.workspace_manager.layout_columns;
        const active = global.workspace_manager.get_active_workspace_index();
        const target = {translation_x: active % columns, translation_y: Math.floor(active / columns)};
        this._glide.remove_all_transitions();
        if (animate)
            this._glide.ease({...target, duration: GLIDE_TIME, mode: Clutter.AnimationMode.EASE_OUT_CUBIC});
        else
            this._glide.set(target);
        this._updateDots();
    }

    // Each dot grows and brightens with its closeness to the highlight, as in the shell.
    _updateDots() {
        const columns = global.workspace_manager.layout_columns;
        const {translation_x: x, translation_y: y} = this._glide;
        this._dots.forEach((dot, i) => {
            const distance = Math.hypot(i % columns - x, Math.floor(i / columns) - y);
            const expansion = Math.clamp(1 - distance, 0, 1);
            const occupied = this._workspaces[i].list_windows().some(w => !w.skip_taskbar);
            const rest = occupied ? OCCUPIED_OPACITY : EMPTY_OPACITY;
            const scale = INACTIVE_SCALE + (1 - INACTIVE_SCALE) * expansion;
            dot.set({
                opacity: Math.round((rest + (1 - rest) * expansion) * 255),
                scale_x: scale,
                scale_y: scale,
            });
        });
    }

    _onScroll(dx, dy) {
        const direction = Math.abs(dx) > Math.abs(dy)
            ? (dx > 0 ? Meta.MotionDirection.RIGHT : Meta.MotionDirection.LEFT)
            : (dy > 0 ? Meta.MotionDirection.DOWN : Meta.MotionDirection.UP);
        this._manager._getTargetWorkspace(direction).activate(global.get_current_time());
        return Clutter.EVENT_STOP;
    }
});
