import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Graphene from 'gi://Graphene';
import Meta from 'gi://Meta';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

// Same look and motion as the shell's own workspace dots (panel.js).
const INACTIVE_SCALE = 0.75;
const EMPTY_OPACITY = 0.35;
const OCCUPIED_OPACITY = 0.6;
const GLIDE_TIME = 250;
const SCALE_TIME = 500;
// The active-workspace pill is this many dots wide; it floats over the grid, so the
// columns stay aligned.
const PILL_WIDTH = 1.8;
// Share of the top bar's height the grid may use; larger grids shrink to fit.
const MAX_HEIGHT_SHARE = 0.7;

function reducedMotion() {
    return St.Settings.get().reducedMotion === St.ReducedMotion.REDUCE;
}

// One workspace dot. The outer actor scales in and out when workspaces come and go,
// the inner dot grows and brightens with its closeness to the pill.
const Dot = GObject.registerClass(
class Dot extends Clutter.Actor {
    _init() {
        super._init({
            layout_manager: new Clutter.BinLayout(),
            pivot_point: new Graphene.Point({x: 0.5, y: 0.5}),
        });
        this.dot = new St.Widget({
            style_class: 'wsmatrix-panel-dot',
            x_expand: true,
            y_expand: true,
            pivot_point: new Graphene.Point({x: 0.5, y: 0.5}),
        });
        this.add_child(this.dot);
    }

    scaleIn() {
        if (reducedMotion())
            return;
        this.set({scale_x: 0, scale_y: 0});
        this.ease({scale_x: 1, scale_y: 1, duration: SCALE_TIME, mode: Clutter.AnimationMode.EASE_OUT_CUBIC});
    }

    scaleOutAndDestroy() {
        if (reducedMotion()) {
            this.destroy();
            return;
        }
        this.ease({
            scale_x: 0,
            scale_y: 0,
            duration: SCALE_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
            onComplete: () => this.destroy(),
        });
    }
});

// The workspace grid drawn inside the Activities button in place of the shell's row of
// dots. Clicking still opens the overview; scrolling moves through the grid.
export default GObject.registerClass(
class GridIndicator extends St.Widget {
    _init(manager) {
        super._init({
            style_class: 'wsmatrix-panel-grid',
            y_align: Clutter.ActorAlign.CENTER,
            reactive: true,
        });
        this._manager = manager;
        this._workspaces = [];
        this._dots = [];
        this._pitch = [1, 1];

        this._pill = new St.Widget({style_class: 'wsmatrix-panel-pill'});
        this._pill.connect('notify::translation-x', () => this._updateDots());
        this._pill.connect('notify::translation-y', () => this._updateDots());
        this.add_child(this._pill);

        const scroll = new Clutter.ScrollController({
            flags: Clutter.ScrollControllerFlags.DISCRETE |
                Clutter.ScrollControllerFlags.SCROLL_VERTICAL |
                Clutter.ScrollControllerFlags.SCROLL_HORIZONTAL,
        });
        scroll.connect('scroll', (_c, _sprite, _source, dx, dy) => this._onScroll(dx, dy));
        this.add_action(scroll);

        global.workspace_manager.connectObject(
            'notify::n-workspaces', () => this.rebuild(),
            'active-workspace-changed', () => this._glideToActive(),
            this);

        this._activities = Main.panel.statusArea.activities;
        this._nativeDots = this._activities.get_first_child();
        this._nativeDots.hide();
        this._nativeDescription = this._activities.accessible_description;
        // The button lays out only its first child.
        this._activities.insert_child_at_index(this, 0);
        this.connect('destroy', () => {
            global.workspace_manager.disconnectObject(this);
            this._workspaces.forEach(w => w.disconnectObject(this));
            this._activities.accessible_description = this._nativeDescription;
            this._nativeDots.show();
        });
        this.rebuild();
    }

    // Adds or removes dots to match the workspaces; the layout follows the grid shape.
    rebuild() {
        this._workspaces.forEach(w => w.disconnectObject(this));
        const workspaceManager = global.workspace_manager;
        const n = workspaceManager.n_workspaces;

        while (this._dots.length < n) {
            const dot = new Dot();
            this.insert_child_below(dot, this._pill);
            this._dots.push(dot);
            dot.scaleIn();
        }
        this._dots.splice(n).forEach(dot => {
            dot._leaving = true;
            dot.scaleOutAndDestroy();
        });

        this._workspaces = [];
        for (let i = 0; i < n; i++) {
            const workspace = workspaceManager.get_workspace_by_index(i);
            workspace.connectObject(
                'window-added', () => this._updateDots(),
                'window-removed', () => this._updateDots(),
                this);
            this._workspaces.push(workspace);
        }
        this._snapPill = true;
        this.queue_relayout();
        this._updateDots();
        this._updateDescription();
    }

    _metrics() {
        const workspaceManager = global.workspace_manager;
        const columns = Math.max(1, workspaceManager.layout_columns);
        const rows = Math.max(1, Math.ceil(workspaceManager.n_workspaces / columns));
        const node = this.get_theme_node();
        let size = node.get_length('-wsmatrix-dot-size');
        let rowSpacing = node.get_length('-wsmatrix-row-spacing');
        let columnSpacing = node.get_length('-wsmatrix-column-spacing');

        const height = rows * size + (rows - 1) * rowSpacing;
        // The bar's CSS height: asking the panel for its size would ask us again.
        const maxHeight = Main.panel.get_theme_node().get_height() * MAX_HEIGHT_SHARE;
        if (height > maxHeight) {
            const shrink = maxHeight / height;
            size *= shrink;
            rowSpacing *= shrink;
            columnSpacing *= shrink;
        }
        return {
            columns, size, rowSpacing, columnSpacing,
            width: columns * size + (columns - 1) * columnSpacing,
            height: rows * size + (rows - 1) * rowSpacing,
        };
    }

    vfunc_get_preferred_width(_forHeight) {
        const {width} = this._metrics();
        return this.get_theme_node().adjust_preferred_width(width, width);
    }

    vfunc_get_preferred_height(_forWidth) {
        const {height} = this._metrics();
        return this.get_theme_node().adjust_preferred_height(height, height);
    }

    vfunc_allocate(box) {
        this.set_allocation(box);
        const content = this.get_theme_node().get_content_box(box);
        const m = this._metrics();
        const x0 = content.x1 + (content.get_width() - m.width) / 2;
        const y0 = content.y1 + (content.get_height() - m.height) / 2;
        this._pitch = [m.size + m.columnSpacing, m.size + m.rowSpacing];

        const cellBox = (column, row, width = m.size) => {
            const b = new Clutter.ActorBox();
            b.set_origin(
                Math.round(x0 + column * this._pitch[0] - (width - m.size) / 2),
                Math.round(y0 + row * this._pitch[1]));
            b.set_size(Math.round(width), Math.round(m.size));
            return b;
        };

        this._dots.forEach((dot, i) => dot.allocate(cellBox(i % m.columns, Math.floor(i / m.columns))));
        // Dots on their way out keep their last place.
        for (const child of this) {
            if (child._leaving)
                child.allocate(child.allocation);
        }

        // The pill sits on cell (0, 0) and is moved by translation, so it can glide.
        this._pill.allocate(cellBox(0, 0, m.size * PILL_WIDTH));
        if (this._snapPill || !this._pill.get_transition('translation-x')) {
            this._snapPill = false;
            this._pill.set(this._target());
        }
    }

    _target() {
        const columns = global.workspace_manager.layout_columns;
        const active = global.workspace_manager.get_active_workspace_index();
        return {
            translation_x: (active % columns) * this._pitch[0],
            translation_y: Math.floor(active / columns) * this._pitch[1],
        };
    }

    _glideToActive() {
        this._pill.remove_all_transitions();
        this._pill.ease({
            ...this._target(),
            duration: reducedMotion() ? 0 : GLIDE_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
        });
        this._updateDescription();
    }

    // Dots grow and brighten as the pill comes close, then hide under it.
    _updateDots() {
        const columns = global.workspace_manager.layout_columns;
        const x = this._pill.translation_x / this._pitch[0];
        const y = this._pill.translation_y / this._pitch[1];
        this._dots.forEach((dot, i) => {
            const distance = Math.hypot(i % columns - x, Math.floor(i / columns) - y);
            const expansion = Math.clamp(1 - distance, 0, 1);
            const occupied = this._workspaces[i]?.list_windows().some(w => !w.skip_taskbar);
            const rest = occupied ? OCCUPIED_OPACITY : EMPTY_OPACITY;
            const scale = INACTIVE_SCALE + (1 - INACTIVE_SCALE) * expansion;
            dot.dot.set({
                opacity: Math.round(rest * (1 - expansion) * 255),
                scale_x: scale,
                scale_y: scale,
            });
        });
    }

    _updateDescription() {
        const workspaceManager = global.workspace_manager;
        const columns = workspaceManager.layout_columns;
        const active = workspaceManager.get_active_workspace_index();
        this._activities.accessible_description =
            `Workspace ${active + 1} of ${workspaceManager.n_workspaces}, ` +
            `row ${Math.floor(active / columns) + 1}, column ${active % columns + 1}`;
    }

    _onScroll(dx, dy) {
        const direction = Math.abs(dx) > Math.abs(dy)
            ? (dx > 0 ? Meta.MotionDirection.RIGHT : Meta.MotionDirection.LEFT)
            : (dy > 0 ? Meta.MotionDirection.DOWN : Meta.MotionDirection.UP);
        this._manager._getTargetWorkspace(direction).activate(global.get_current_time());
        return Clutter.EVENT_STOP;
    }
});
