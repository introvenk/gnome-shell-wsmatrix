import Override from '../Override.js';
import {overview} from 'resource:///org/gnome/shell/ui/main.js';
import {SMALL_WORKSPACE_RATIO, ControlsState} from 'resource:///org/gnome/shell/ui/overviewControls.js';

// Not exported by the shell; values from ui/overviewControls.js (GNOME 47+).
const THUMBNAILS_SPACING_ADJUSTMENT_TOP = 0.6;
const THUMBNAILS_SPACING_ADJUSTMENT_BOTTOM = 0.4;

const _computeWorkspacesBoxForState = function(state, box, searchHeight, dashHeight, thumbnailsHeight, spacing) {
    const workspaceBox = box.copy();
    const [width, height] = workspaceBox.get_size();
    const {y1: startY} = this._workAreaBox;
    const {expandFraction} = this._workspacesThumbnails;

    const workspaceManager = global.workspace_manager;
    const rows = workspaceManager.layout_rows;

    switch (state) {
    case ControlsState.HIDDEN:
        workspaceBox.set_origin(...this._workAreaBox.get_origin());
        workspaceBox.set_size(...this._workAreaBox.get_size());
        break;
    case ControlsState.WINDOW_PICKER:
        workspaceBox.set_origin(0,
            startY + searchHeight + Math.round(spacing * THUMBNAILS_SPACING_ADJUSTMENT_TOP) +
            thumbnailsHeight * rows + Math.round(spacing * THUMBNAILS_SPACING_ADJUSTMENT_BOTTOM) * expandFraction);
        workspaceBox.set_size(width,
            height -
            dashHeight - spacing -
            searchHeight - Math.round(spacing * THUMBNAILS_SPACING_ADJUSTMENT_TOP) -
            thumbnailsHeight * rows - Math.round(spacing * THUMBNAILS_SPACING_ADJUSTMENT_BOTTOM) * expandFraction);
        break;
    case ControlsState.APP_GRID:
        workspaceBox.set_origin(0, startY + searchHeight + spacing);
        workspaceBox.set_size(
            width,
            Math.round(height * rows * SMALL_WORKSPACE_RATIO));
        break;
    }

    return workspaceBox;
}

export default class ControlsManagerLayout extends Override {
    enable() {
        const subject = overview._overview._controls.layout_manager;
        this._im.overrideMethod(subject, '_computeWorkspacesBoxForState', (original) => {
            return _computeWorkspacesBoxForState.bind(subject);
        });
    }
}
