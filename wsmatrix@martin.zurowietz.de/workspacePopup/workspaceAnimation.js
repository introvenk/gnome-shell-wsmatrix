import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import St from 'gi://St';
import {
    WORKSPACE_SPACING,
    WorkspaceGroup,
    WorkspaceAnimationController as GWorkspaceAnimationController,
    MonitorGroup as GMonitorGroup,
} from 'resource:///org/gnome/shell/ui/workspaceAnimation.js';

// Subclass of the native MonitorGroup that lays out the workspaces as a grid instead of a
// single row/column. Everything else (swipe interpolation, workspaces adjustment, ...) is
// inherited from the shell.
const MonitorGroup = GObject.registerClass(
class MonitorGroup extends GMonitorGroup {
    _init(monitor, workspaceIndices, movingWindow) {
        // Must be set before super._init() because it already reads the progress.
        this.activeWorkspace = workspaceIndices[0];
        this.targetWorkspace = workspaceIndices[workspaceIndices.length - 1];

        super._init(monitor, workspaceIndices, movingWindow);

        this._layoutGrid();
        this.progress = this.getWorkspaceProgress(global.workspace_manager.get_active_workspace());
    }

    _layoutGrid() {
        const {fromRow, fromColumn, targetRow, targetColumn} = this._directions();
        const vertical = targetRow !== fromRow && targetColumn === fromColumn;
        let x = 0;
        let y = 0;

        for (const group of this._workspaceGroups) {
            const ws = group.workspace;
            const fullscreen = ws.list_windows().some(w => w.get_monitor() === this._monitor.index && w.is_fullscreen());

            if (ws.index() > 0 && vertical && !fullscreen && this._monitor.index === Main.layoutManager.primaryIndex) {
                // We have to shift windows up or down by the height of the panel to prevent having a
                // visible gap between the windows while switching workspaces. Since fullscreen windows
                // hide the panel, they don't need to be shifted up or down.
                y -= Main.panel.height;
            }

            group.set_position(x, y);

            if (targetRow > fromRow)
                y += this.baseDistanceY;
            else if (targetRow < fromRow)
                y -= this.baseDistanceY;

            if (targetColumn > fromColumn)
                x += this.baseDistanceX;
            else if (targetColumn < fromColumn)
                x -= this.baseDistanceX;
        }
    }

    _directions() {
        const columns = global.workspace_manager.layout_columns;
        return {
            fromRow: Math.floor(this.activeWorkspace / columns),
            fromColumn: this.activeWorkspace % columns,
            targetRow: Math.floor(this.targetWorkspace / columns),
            targetColumn: this.targetWorkspace % columns,
        };
    }

    get baseDistanceX() {
        const spacing = WORKSPACE_SPACING * St.ThemeContext.get_for_stage(global.stage).scale_factor;
        return this._monitor.width + spacing;
    }

    get baseDistanceY() {
        const spacing = WORKSPACE_SPACING * St.ThemeContext.get_for_stage(global.stage).scale_factor;
        return this._monitor.height + spacing;
    }

    get progress() {
        const {fromRow, fromColumn, targetRow, targetColumn} = this._directions();

        if (targetRow > fromRow)
            return -this._container.y / this.baseDistanceY;
        else if (targetRow < fromRow)
            return this._container.y / this.baseDistanceY;

        if (targetColumn > fromColumn)
            return -this._container.x / this.baseDistanceX;
        else if (targetColumn < fromColumn)
            return this._container.x / this.baseDistanceX;

        return 0;
    }

    set progress(p) {
        const {fromRow, fromColumn, targetRow, targetColumn} = this._directions();

        if (targetRow > fromRow)
            this._container.y = -Math.round(p * this.baseDistanceY);
        else if (targetRow < fromRow)
            this._container.y = Math.round(p * this.baseDistanceY);

        if (targetColumn > fromColumn)
            this._container.x = -Math.round(p * this.baseDistanceX);
        else if (targetColumn < fromColumn)
            this._container.x = Math.round(p * this.baseDistanceX);

        this.notify('progress');
    }

    _getWorkspaceGroupProgress(group) {
        const {fromRow, fromColumn, targetRow, targetColumn} = this._directions();

        if (targetRow > fromRow)
            return group.y / this.baseDistanceY;
        else if (targetRow < fromRow)
            return -group.y / this.baseDistanceY;

        if (targetColumn > fromColumn)
            return group.x / this.baseDistanceX;
        else if (targetColumn < fromColumn)
            return -group.x / this.baseDistanceX;

        return 0;
    }
});

export class WorkspaceAnimationController extends GWorkspaceAnimationController {
    animateSwitch(from, to, direction, onComplete) {
        // The grid MonitorGroups only know the workspaces of their own switch, so a running
        // switch can't be reused like upstream does. Finish it before starting the new one.
        if (this._switchData && !this._switchData.gestureActivated) {
            const pending = this._pendingOnComplete;
            this._switchData.monitors.forEach(m => m.remove_all_transitions());
            this._finishWorkspaceSwitch(this._switchData);
            this._pendingOnComplete = null;
            pending?.();
        }

        this._pendingOnComplete = onComplete;
        super.animateSwitch(from, to, direction, () => {
            this._pendingOnComplete = null;
            onComplete();
        });
    }

    _prepareWorkspaceSwitch(workspaceIndices) {
        if (this._switchData)
            return;

        const workspaceManager = global.workspace_manager;
        const nWorkspaces = workspaceManager.get_n_workspaces();

        const switchData = {};

        this._switchData = switchData;
        switchData.monitors = [];

        switchData.gestureActivated = false;
        switchData.inProgress = false;

        if (!workspaceIndices)
            workspaceIndices = [...Array(nWorkspaces).keys()];

        const monitors = Meta.prefs_get_workspaces_only_on_primary()
            ? [Main.layoutManager.primaryMonitor] : Main.layoutManager.monitors;

        for (const monitor of monitors) {
            if (Meta.prefs_get_workspaces_only_on_primary() &&
                monitor.index !== Main.layoutManager.primaryIndex)
                continue;

            const group = new MonitorGroup(monitor, workspaceIndices, this.movingWindow);

            Main.uiGroup.insert_child_above(group, global.window_group);

            switchData.monitors.push(group);
        }

        global.compositor.disable_unredirect();
    }
}
