import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import SpreadWorkspace, {overviewWindowCount} from './spreadWorkspace.js';
import WorkspaceThumbnail from './workspaceThumbnail.js';

// One popup cell. Shows the workspace spread out while it has windows that would hide each
// other and as a plain thumbnail otherwise, and swaps between the two when windows are moved
// in or out while the popup is up.
export default GObject.registerClass(
class WorkspaceCell extends Clutter.Actor {
    _init(metaWorkspace, monitorIndex, spread, logger) {
        super._init({layout_manager: new Clutter.FixedLayout()});
        this.metaWorkspace = metaWorkspace;
        this._monitorIndex = monitorIndex;
        this._spread = spread;
        this._logger = logger;
        this._size = null;
        this.view = null;

        // A window being removed, or leaving this monitor, is still listed while the signal
        // runs, so it is left out of the count.
        if (spread) {
            metaWorkspace.connectObject(
                'window-added', () => this._sync(),
                'window-removed', (_workspace, window) => this._sync(window),
                this);
            global.display.connectObject(
                'window-entered-monitor', () => this._sync(),
                'window-left-monitor', (_display, monitorIndex, window) =>
                    this._sync(monitorIndex === this._monitorIndex ? window : null),
                this);
        }
        this._sync();
    }

    _sync(leaving = null) {
        const spread = this._spread &&
            overviewWindowCount(this.metaWorkspace, this._monitorIndex, leaving) > 1;
        if (this.view && (this.view instanceof SpreadWorkspace) === spread)
            return;

        this.view?.destroy();
        this.view = this._create(spread);
        // The new view picked up the leaving window from the list, and its own removal
        // handler came too late to see this signal, so the window would stay in the cell.
        if (leaving)
            this.view._doRemoveWindow(leaving);
        this.add_child(this.view);
        this._applyScale();
    }

    // Any cell where GNOME's overview workspace can't be built falls back to the thumbnail.
    _create(spread) {
        if (spread) {
            try {
                return new SpreadWorkspace(this.metaWorkspace, this._monitorIndex);
            } catch (e) {
                this._logger.warn(`showing a thumbnail instead of spread windows: ${e}`);
            }
        }
        return new WorkspaceThumbnail(this.metaWorkspace, this._monitorIndex);
    }

    // The list scales the cell to fit its button. Keep that size rather than the scale: the
    // spread workspace and the thumbnail have different natural sizes.
    setScale(scaleX, scaleY) {
        this._size = [scaleX * this.get_width(), scaleY * this.get_height()];
        this._applyScale();
    }

    _applyScale() {
        if (!this._size)
            return;
        const [width, height] = this._size;
        this.view.setScale(width / this.view.get_width(), height / this.view.get_height());
    }
});
