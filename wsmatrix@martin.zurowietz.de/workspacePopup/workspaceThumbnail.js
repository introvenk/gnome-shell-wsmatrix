import GObject from 'gi://GObject';
import {BackgroundManager} from 'resource:///org/gnome/shell/ui/background.js';
import {WorkspaceThumbnail as GWorkspaceThumbnail} from 'resource:///org/gnome/shell/ui/workspaceThumbnail.js';

// Shell thumbnails (GNOME 40+) don't draw the wallpaper; add it, tied to the thumbnail's life.
export function addBackground(thumbnail) {
    const bgManager = new BackgroundManager({
        monitorIndex: thumbnail.monitorIndex,
        container: thumbnail._contents,
        vignette: false,
    });
    // The shared Background outlives the thumbnail and would keep it alive.
    thumbnail.connect('destroy', () => bgManager.destroy());
}

export default GObject.registerClass(
class WorkspaceThumbnail extends GWorkspaceThumbnail {
    _init(metaWorkspace, monitorIndex) {
        super._init(metaWorkspace, monitorIndex);
        addBackground(this);
    }
});
