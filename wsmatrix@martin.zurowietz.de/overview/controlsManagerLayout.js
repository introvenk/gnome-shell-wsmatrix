import Override from '../Override.js';
import {overview} from 'resource:///org/gnome/shell/ui/main.js';
import {SMALL_WORKSPACE_RATIO, ControlsState} from 'resource:///org/gnome/shell/ui/overviewControls.js';

// Room for the app-grid workspaces when there are several rows. Scaling by the full row
// count squeezed the app grid until icons overlapped; the stock single-row size made the
// grid unreadable.
const APP_GRID_MAX_GROWTH = 1.6;

export default class ControlsManagerLayout extends Override {
    enable() {
        const subject = overview._overview._controls.layout_manager;
        // Give the app-grid workspaces room for several rows.
        this._im.overrideMethod(subject, '_computeWorkspacesBoxForState', original =>
            function (state, box, ...args) {
                const rows = global.workspace_manager.layout_rows;
                const workspaceBox = original.call(this, state, box, ...args);

                if (state === ControlsState.APP_GRID && rows > 1) {
                    const growth = Math.min(rows, APP_GRID_MAX_GROWTH);
                    workspaceBox.set_size(box.get_width(),
                        Math.round(box.get_height() * SMALL_WORKSPACE_RATIO * growth));
                }

                return workspaceBox;
            });
    }
}
