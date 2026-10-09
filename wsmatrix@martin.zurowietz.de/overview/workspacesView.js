import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {WorkspaceLayout as GWorkspaceLayout} from 'resource:///org/gnome/shell/ui/workspace.js';
import Override from '../Override.js';
import {FitMode, WorkspacesView as GWorkspacesView} from 'resource:///org/gnome/shell/ui/workspacesView.js';

const _getFirstFitAllWorkspaceBox = function (box, spacing, vertical) {
    const workspaceManager = global.workspace_manager;
    const rows = workspaceManager.layout_rows;
    const columns = workspaceManager.layout_columns;

    const [width, height] = box.get_size();
    const [workspace] = this._workspaces;

    const fitAllBox = new Clutter.ActorBox();

    let [x1, y1] = box.get_origin();

    // Spacing here is not only the space between workspaces, but also the
    // space before the first workspace, and after the last one. This prevents
    // workspaces from touching the edges of the allocation box.
    const availableWidth = width - spacing * (columns + 1);
    const availableHeight = height - spacing * (rows + 1);
    let workspaceWidth = availableWidth / columns;
    let workspaceHeight = availableHeight / rows;
    let [, wh] = workspace.get_preferred_height(workspaceWidth);
    let [, ww] = workspace.get_preferred_width(workspaceHeight);
    if (wh < workspaceHeight) {
        workspaceHeight = wh;
    } else {
        workspaceWidth = ww;
    }

    fitAllBox.set_size(workspaceWidth, height);
    fitAllBox.set_origin(width / 2 - (workspaceWidth + spacing) * columns / 2, -rows / 2 * workspaceHeight);

    return fitAllBox;
}

// Grid cell [column, row] the picker is centered on. During a switch it moves straight
// from the source to the target cell, so 1 -> 3 in a 2-column grid doesn't pass 2.
const currentCell = function (columns) {
    const value = this._scrollAdjustment.value;
    const {_wsmatrixFrom: from, _wsmatrixTo: to} = this;
    const cell = i => [i % columns, Math.floor(i / columns)];
    let a, b, f;

    if (this._animating && !this._gestureActive && from !== undefined && from !== to) {
        [a, b] = [cell(from), cell(to)];
        f = Math.max(0, Math.min(1, (value - from) / (to - from)));
    } else if (Math.abs(value - Math.round(value)) < 1e-3) {
        // An ease can stop a hair short (5.9999), which would aim at a phantom column.
        return cell(Math.round(value));
    } else {
        // Gesture: between the neighbouring cells, in 2D.
        [a, b] = [cell(Math.floor(value)), cell(Math.ceil(value))];
        f = value - Math.floor(value);
    }
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
};

const vfunc_allocate = function (box) {
    this.set_allocation(box);
    const workspaceManager = global.workspace_manager;
    const rows = workspaceManager.layout_rows;
    const columns = workspaceManager.layout_columns;

    if (this._workspaces.length === 0)
        return;

    const vertical = workspaceManager.layout_rows === -1;
    const rtl = this.text_direction === Clutter.TextDirection.RTL;

    const fitMode = this._fitModeAdjustment.value;

    // Other rows sit above and below the picker; clip them in single mode. The
    // app-grid layout extends above the box on purpose, so leave it unclipped.
    this.clip_to_allocation = fitMode === FitMode.SINGLE;

    let [fitSingleBox, fitAllBox] = this._getInitialBoxes(box);
    const fitSingleSpacing =
        this._getSpacing(fitSingleBox, FitMode.SINGLE, vertical);
    fitSingleBox =
        this._getFirstFitSingleWorkspaceBox(fitSingleBox, fitSingleSpacing, vertical);

    const fitAllSpacing =
        this._getSpacing(fitAllBox, FitMode.ALL, vertical);
    fitAllBox =
        this._getFirstFitAllWorkspaceBox(fitAllBox, fitAllSpacing, vertical);

    // Account for RTL locales by reversing the list
    const workspaces = this._workspaces.slice();
    if (rtl)
        workspaces.reverse();

    const [fitSingleX1, fitSingleY1] = fitSingleBox.get_origin();
    const [fitSingleWidth, fitSingleHeight] = fitSingleBox.get_size();
    const [fitAllX1, fitAllY1] = fitAllBox.get_origin();
    const [fitAllWidth, fitAllHeight] = fitAllBox.get_size();

    workspaces.forEach((child, i) => {
        // Single mode: every workspace at its own grid cell.
        const singleBox = new Clutter.ActorBox();
        singleBox.set_size(fitSingleWidth, fitSingleHeight);
        singleBox.set_origin(
            fitSingleX1 + (fitSingleWidth + fitSingleSpacing) * (i % columns),
            fitSingleY1 + (fitSingleHeight + fitSingleSpacing) * Math.floor(i / columns));

        if (fitMode === FitMode.SINGLE)
            box = singleBox;
        else if (fitMode === FitMode.ALL)
            box = fitAllBox;
        else
            box = singleBox.interpolate(fitAllBox, fitMode);

        child.allocate_align_fill(box, 0.5, 0.5, false, false);

        const targetRow = Math.floor((1+i) / columns);
        const targetColumn = (1+i) % columns;

        let [, h] = child.get_preferred_height(fitAllWidth)
        fitAllBox.set_origin(
            fitAllX1 + (fitAllWidth + fitAllSpacing) * targetColumn,
            fitAllY1 + (h + fitAllSpacing) * targetRow);
    });
}


export default class WorkspacesView extends Override {
    enable() {
        const subject = GWorkspacesView.prototype;

        // Remember where a switch starts and ends.
        this._im.overrideMethod(subject, '_scrollToActive', original =>
            function () {
                this._wsmatrixFrom = Math.round(this._scrollAdjustment.value);
                this._wsmatrixTo = global.workspace_manager.get_active_workspace_index();
                return original.call(this);
            });

        // The shell centers workspace `value` of a single row; center the grid cell instead.
        this._im.overrideMethod(subject, '_getFirstFitSingleWorkspaceBox', original =>
            function (box, spacing, vertical) {
                const fitSingleBox = original.call(this, box, spacing, vertical);
                if (vertical)
                    return fitSingleBox;
                const [column, row] = currentCell.call(this, global.workspace_manager.layout_columns);
                const value = this._scrollAdjustment.value;
                fitSingleBox.set_origin(
                    fitSingleBox.x1 + (value - column) * (fitSingleBox.get_width() + spacing),
                    fitSingleBox.y1 - row * (box.get_height() + spacing));
                return fitSingleBox;
            });

        // The shell shows index neighbours, which at a row edge live in another row.
        // Show the active row's neighbours at rest and the rows in a switch while it runs.
        this._im.overrideMethod(subject, '_updateVisibility', original =>
            function () {
                original.call(this);
                if (this._fitModeAdjustment.value !== FitMode.SINGLE || this._gestureActive)
                    return;
                const workspaceManager = global.workspace_manager;
                const columns = workspaceManager.layout_columns;
                const active = workspaceManager.get_active_workspace_index();
                const rowOf = i => Math.floor(i / columns);
                const rows = new Set([rowOf(active)]);
                if (this._animating) {
                    rows.add(rowOf(this._wsmatrixFrom ?? active));
                    rows.add(rowOf(this._wsmatrixTo ?? active));
                }
                this._workspaces.forEach((workspace, i) => {
                    workspace.visible = this._animating
                        ? rows.has(rowOf(i))
                        : rowOf(i) === rowOf(active) && Math.abs(i % columns - active % columns) <= 1;
                });
            });

        // The shell trims a workspace's window slots by how far it sticks out below the
        // monitor. Other rows are parked whole rows away, so their previews shrank to
        // stamps or vanished. Measure them as if they were in the picker's row.
        this._im.overrideMethod(GWorkspaceLayout.prototype, '_adjustSpacingAndPadding', original =>
            function (rowSpacing, colSpacing, containerBox) {
                const workspace = this._container.get_parent();
                const view = workspace?.get_parent();
                const active = view instanceof GWorkspacesView &&
                    view._workspaces[global.workspace_manager.get_active_workspace_index()];
                const offset = containerBox && active?.has_allocation() && workspace.has_allocation()
                    ? workspace.allocation.y1 - active.allocation.y1 : 0;
                if (!offset)
                    return original.call(this, rowSpacing, colSpacing, containerBox);
                const translation = workspace.translation_y;
                workspace.translation_y = translation - offset;
                try {
                    return original.call(this, rowSpacing, colSpacing, containerBox);
                } finally {
                    workspace.translation_y = translation;
                }
            });
        this._im.overrideMethod(subject, '_getFirstFitAllWorkspaceBox', (original) => {
            return function () {
                return _getFirstFitAllWorkspaceBox.call(this, ...arguments);
            };
        });

        this._im.overrideMethod(subject, 'vfunc_allocate', (original) => {
            return function () {
                return vfunc_allocate.call(this, ...arguments);
            };
        });
    }

    disable() {
        super.disable();
        Main.overview._overview?._controls?._workspacesDisplay?._workspacesViews
            ?.forEach(view => (view.clip_to_allocation = false));
    }
}
