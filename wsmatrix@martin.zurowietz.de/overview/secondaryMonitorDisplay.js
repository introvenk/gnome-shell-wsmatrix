import Override from '../Override.js';
import {SecondaryMonitorDisplay as GSecondaryMonitorDisplay} from 'resource:///org/gnome/shell/ui/workspacesView.js';

export default class SecondaryMonitorDisplay extends Override {
    enable() {
        // The thumbnails strip is `rows` thumbnails tall; let the shell lay out the rest.
        this._im.overrideMethod(GSecondaryMonitorDisplay.prototype, '_getWorkspacesBoxForState', original =>
            function (state, box, padding, thumbnailsHeight, spacing) {
                const rows = global.workspace_manager.layout_rows;
                return original.call(this, state, box, padding, thumbnailsHeight * rows, spacing);
            });
    }
}
