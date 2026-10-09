import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import WorkspaceSwitcherPopup from "./workspaceSwitcherPopup.js";
import {SCROLL_TIMEOUT_TIME} from 'resource:///org/gnome/shell/ui/windowManager.js';
import {WorkspaceAnimationController} from "./workspaceAnimation.js";

const WraparoundMode = {
    NONE: 0,
    NEXT_PREV: 1,
    ROW_COL: 2,
    NEXT_PREV_BORDER: 3,
};

export default class WorkspaceManagerOverride {
    constructor(settings, keybindings, logger) {
        this._logger = logger;
        this.wm = Main.wm;
        this.wm._wsPopupList = [];
        this.settings = settings;
        this._mutterSettings = new Gio.Settings({schema_id: 'org.gnome.mutter'});
        this.wsManager = global.workspace_manager;
        this.originalDynamicWorkspaces = this._mutterSettings.get_boolean('dynamic-workspaces');
        this.originalAllowedKeybindings = {};
        this._keybindings = keybindings;
        this._overviewKeybindingActions = {};
        this.monitors = [];

        this._workspaceAnimation = new WorkspaceAnimationController();
        this.overrideProperties = [
            '_workspaceAnimation',
            'handleWorkspaceScroll',
        ];
    }

    enable() {
        this._overrideDynamicWorkspaces();
        this._overrideKeybindingHandlers();
        this._overrideOriginalProperties();
        this._takeOverSwipe();
        this._handleNumberOfWorkspacesChanged();
        this._handleMultiMonitorChanged();
        this._handleWraparoundModeChanged();
        this._connectSettings();
        this._notify();
        this._addKeybindings();
        this._connectLayoutManager();
    }

    disable() {
        this._destroyWorkspaceSwitcherPopup();
        this._restoreLayout();
        this._restoreKeybindingHandlers();
        this._restoreDynamicWorkspaces();
        this._restoreSwipe();
        this._restoreOriginalProperties();
        this._disconnectSettings();
        this._notify();
        this._removeKeybindings();
        this._disconnectLayoutManager();
    }

    _overrideOriginalProperties() {
        this.wm._overrideProperties = {};
        this.overrideProperties.forEach(function (prop) {
            if (this.wm[prop].bind) {
                this.wm._overrideProperties[prop] = this.wm[prop].bind(this.wm);
                this.wm[prop] = this[prop].bind(this.wm);
            } else {
                this.wm._overrideProperties[prop] = this.wm[prop];
                this.wm[prop] = this[prop];
            }
        }, this);
    }

    _restoreOriginalProperties() {
        if (this.wm._wsmatrixTimeoutId) {
            GLib.source_remove(this.wm._wsmatrixTimeoutId);
            this.wm._wsmatrixTimeoutId = 0;
        }

        this.overrideProperties.forEach(function (prop) {
            this.wm[prop] = this.wm._overrideProperties[prop];
        }, this);
    }

    // The shell's own controller keeps its swipe tracker on the stage, so every swipe
    // ran twice. Turn its gestures off (enabling is toggled by the shell itself, the
    // allowed modes are not) and let ours handle them.
    _takeOverSwipe() {
        const tracker = this.wm._overrideProperties._workspaceAnimation?._swipeTracker;
        this._mutedSwipeGestures = [tracker, tracker?._touchpadGesture, tracker?._scrollGesture]
            .filter(g => g)
            .map(g => {
                const modes = g._allowedModes;
                g._allowedModes = Shell.ActionMode.NONE;
                return [g, modes];
            });

        this._workspaceAnimation.onSwipeComplete = () => this._showWorkspaceSwitcherPopup(false, true);
        this._handleVerticalSwipeChanged();
    }

    _restoreSwipe() {
        this._workspaceAnimation.destroy();
        this._restoreOverviewSwipe();
        this._mutedSwipeGestures.forEach(([g, modes]) => (g._allowedModes = modes));
        this._mutedSwipeGestures = [];
    }

    // Vertical swipes open the overview by default, so taking them over is opt-in.
    _handleVerticalSwipeChanged() {
        if (this.settings.get_boolean('vertical-swipe')) {
            if (this._overviewSwipeModes === undefined && Main.overview._swipeTracker) {
                this._overviewSwipeModes = Main.overview._swipeTracker._allowedModes;
                Main.overview._swipeTracker._allowedModes = Shell.ActionMode.NONE;
            }
            this._workspaceAnimation.enableVerticalSwipe();
        } else {
            this._workspaceAnimation.disableVerticalSwipe();
            this._restoreOverviewSwipe();
        }
    }

    _restoreOverviewSwipe() {
        if (this._overviewSwipeModes === undefined)
            return;
        Main.overview._swipeTracker._allowedModes = this._overviewSwipeModes;
        this._overviewSwipeModes = undefined;
    }

    _connectSettings() {
        const destroyPopup = this._destroyWorkspaceSwitcherPopup.bind(this);
        this.settings.connectObject(
            'changed::num-rows', this._handleNumberOfWorkspacesChanged.bind(this),
            'changed::num-columns', this._handleNumberOfWorkspacesChanged.bind(this),
            'changed::multi-monitor', this._handleMultiMonitorChanged.bind(this),
            'changed::wraparound-mode', this._handleWraparoundModeChanged.bind(this),
            'changed::vertical-swipe', this._handleVerticalSwipeChanged.bind(this),
            'changed::popup-timeout', destroyPopup,
            'changed::scale', destroyPopup,
            'changed::show-thumbnails', destroyPopup,
            'changed::show-workspace-names', destroyPopup,
            'changed::enable-popup-workspace-hover', destroyPopup,
            this);
    }

    _disconnectSettings() {
        this.settings.disconnectObject(this);
    }

    _connectLayoutManager() {
        Main.layoutManager.connectObject('monitors-changed', this._updateMonitors.bind(this), this);
    }

    _disconnectLayoutManager() {
        Main.layoutManager.disconnectObject(this);
    }

    _addKeybindings() {
        this._toggleAction = this.wm.addKeybinding(
            'workspace-overview-toggle',
            this._keybindings,
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.NORMAL,
            this._showWorkspaceSwitcherPopup.bind(this, true)
        );
    }

    _addWorkspaceOverviewKeybindings() {
        this._overviewKeybindingActions.right = this.wm.addKeybinding(
            'workspace-overview-right',
            this._keybindings,
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.POPUP,
            () => null
        );

        this._overviewKeybindingActions.left = this.wm.addKeybinding(
            'workspace-overview-left',
            this._keybindings,
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.POPUP,
            () => null
        );

        this._overviewKeybindingActions.up = this.wm.addKeybinding(
            'workspace-overview-up',
            this._keybindings,
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.POPUP,
            () => null
        );

        this._overviewKeybindingActions.down = this.wm.addKeybinding(
            'workspace-overview-down',
            this._keybindings,
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.POPUP,
            () => null
        );

        this._overviewKeybindingActions.confirm = this.wm.addKeybinding(
            'workspace-overview-confirm',
            this._keybindings,
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.POPUP,
            () => null
        );
    }

    _removeKeybindings() {
        this.wm.removeKeybinding('workspace-overview-toggle');
    }

    _removeWorkspaceOverviewKeybindings() {
        this.wm.removeKeybinding('workspace-overview-right');
        this.wm.removeKeybinding('workspace-overview-left');
        this.wm.removeKeybinding('workspace-overview-up');
        this.wm.removeKeybinding('workspace-overview-down');
        this.wm.removeKeybinding('workspace-overview-confirm');
    }

    _handleNumberOfWorkspacesChanged() {
        this.rows = this.settings.get_int('num-rows');
        this.columns = this.settings.get_int('num-columns');
        this._overrideNumberOfWorkspaces();
        this._overrideLayout();
        this._destroyWorkspaceSwitcherPopup();
    }

    _handleMultiMonitorChanged() {
        this.multiMonitor = this.settings.get_boolean('multi-monitor');
        this._updateMonitors();
        this._destroyWorkspaceSwitcherPopup();
    }

    _handleWraparoundModeChanged() {
        this.wraparoundMode = this.settings.get_enum('wraparound-mode');
    }

    _overrideLayout() {
        this.wsManager.override_workspace_layout(
            Meta.DisplayCorner.TOPLEFT, // workspace 0
            false, // true == lay out in columns. false == lay out in rows
            this.rows,
            this.columns
        );
    }

    _restoreLayout() {
        this.wsManager.override_workspace_layout(
            Meta.DisplayCorner.TOPLEFT, // workspace 0
            false, // true == lay out in columns. false == lay out in rows
            1,
            -1
        );
    }

    _overrideKeybindingHandlers() {
        for (let key in this.wm._allowedKeybindings) {
            if (key.includes('workspace')) {
                this.originalAllowedKeybindings[key] = this.wm._allowedKeybindings[key];
                this.wm.setCustomKeybindingHandler(key,
                    Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
                    this._showWorkspaceSwitcher.bind(this)
                );
            }
        }
    }

    _restoreKeybindingHandlers() {
        for (let key in this.originalAllowedKeybindings) {
            this.wm.setCustomKeybindingHandler(key,
                this.originalAllowedKeybindings[key],
                this.wm._showWorkspaceSwitcher.bind(this.wm)
            );
        }
    }

    _overrideNumberOfWorkspaces() {
        this._forceNumberOfWorkspaces(this.rows * this.columns);
    }

    _forceNumberOfWorkspaces(total) {
        while (this.wsManager.n_workspaces < total) {
            this.wsManager.append_new_workspace(false, global.get_current_time());
        }

        while (this.wsManager.n_workspaces > total) {
            const last = this.wsManager.get_workspace_by_index(this.wsManager.n_workspaces - 1);
            // Removing a workspace moves its windows to the previous one, which piles up all
            // windows of surplus workspaces on the last workspace of the grid (#328).
            if (last.list_windows().some(w => !w.is_on_all_workspaces())) {
                this._logger.warn(`keeping ${this.wsManager.n_workspaces - total} surplus workspace(s) because they still contain windows`);
                break;
            }
            this.wsManager.remove_workspace(last, global.get_current_time());
        }
    }

    _overrideDynamicWorkspaces() {
        this._mutterSettings.set_boolean('dynamic-workspaces', false);
    }

    _restoreDynamicWorkspaces() {
        this._mutterSettings.set_boolean(
            'dynamic-workspaces',
            this.originalDynamicWorkspaces
        );
    }

    handleWorkspaceScroll(event) {
        if (!this._canScroll)
            return Clutter.EVENT_PROPAGATE;

        if (event.type() !== Clutter.EventType.SCROLL)
            return Clutter.EVENT_PROPAGATE;

        if (event.is_pointer_emulated())
            return Clutter.EVENT_PROPAGATE;

        let direction = event.get_scroll_direction();
        if (direction === Clutter.ScrollDirection.SMOOTH) {
            const [dx, dy] = event.get_scroll_delta();
            if (Math.abs(dx) > Math.abs(dy)) {
                direction = dx < 0
                    ? Clutter.ScrollDirection.LEFT
                    : Clutter.ScrollDirection.RIGHT;
            } else if (Math.abs(dy) > Math.abs(dx)) {
                direction = dy < 0
                    ? Clutter.ScrollDirection.UP
                    : Clutter.ScrollDirection.DOWN;
            } else {
                return Clutter.EVENT_PROPAGATE;
            }
        }

        const workspaceManager = global.workspace_manager;
        const activeWs = workspaceManager.get_active_workspace();
        let ws;
        switch (direction) {
        case Clutter.ScrollDirection.UP:
            ws = activeWs.get_neighbor(Meta.MotionDirection.UP);
            break;
        case Clutter.ScrollDirection.LEFT:
            ws = activeWs.get_neighbor(Meta.MotionDirection.LEFT);
            break;
        case Clutter.ScrollDirection.DOWN:
            ws = activeWs.get_neighbor(Meta.MotionDirection.DOWN);
            break;
        case Clutter.ScrollDirection.RIGHT:
            ws = activeWs.get_neighbor(Meta.MotionDirection.RIGHT);
            break;
        default:
            return Clutter.EVENT_PROPAGATE;
        }

        this.actionMoveWorkspace(ws);

        this._canScroll = false;
        // Store the timeout ID to remove it on destroy as per a review requested on
        // e.g.o.
        this._wsmatrixTimeoutId =
            GLib.timeout_add(GLib.PRIORITY_DEFAULT,
                SCROLL_TIMEOUT_TIME, () => {
                    this._canScroll = true;
                    this._wsmatrixTimeoutId = 0;
                    return GLib.SOURCE_REMOVE;
                });

        return Clutter.EVENT_STOP;
    }

    _updateMonitors() {
        this.monitors = this.multiMonitor ?
            Main.layoutManager.monitors :
            [Main.layoutManager.primaryMonitor];
    }

    _notify() {
        // Update the workspace display to match the number of workspaces.
        this.wsManager.notify('n-workspaces');
    }

    /*
     * This is Main.wm._showWorkspaceSwitcher but without ignoring the UP and DOWN
     * directions and using the WorkspaceSwitcherPopup (with constructor arguments)
     * provided by this extension.
     */
    _showWorkspaceSwitcher(display, window, event, binding) {
        let workspaceManager = this.wsManager;

        if (!Main.sessionMode.hasWorkspaces)
            return;

        if (workspaceManager.n_workspaces == 1)
            return;

        if (binding.get_name) {
            binding = binding.get_name();
        }

        let [action,,, target] = binding.split('-');
        let newWs;
        let direction;

        if (action == 'move') {
            // "Moving" a window to another workspace doesn't make sense when
            // it cannot be unstuck, and is potentially confusing if a new
            // workspaces is added at the start/end
            if (window.is_always_on_all_workspaces() ||
                (Meta.prefs_get_workspaces_only_on_primary() &&
                window.get_monitor() != Main.layoutManager.primaryIndex))
                return;
        }

        if (target == 'last') {
            direction = Meta.MotionDirection.DOWN;
            newWs = workspaceManager.get_workspace_by_index(workspaceManager.n_workspaces - 1);
        } else if (target !== undefined && isNaN(target)) {
            direction = Meta.MotionDirection[target.toUpperCase()];
            newWs = this._getTargetWorkspace(direction);
        } else if ((target > 0) && (target <= workspaceManager.n_workspaces)) {
            target--;
            newWs = workspaceManager.get_workspace_by_index(target);

            if (workspaceManager.get_active_workspace().index() > target)
                direction = Meta.MotionDirection.UP;
            else
                direction = Meta.MotionDirection.DOWN;
        }

        if (newWs !== undefined) {
            if (action == 'switch') {
                this.wm.actionMoveWorkspace(newWs);
                this._showWorkspaceSwitcherPopup(false);
            } else {
                this._showWorkspaceSwitcherPopup(false);
                this.wm.actionMoveWindow(window, newWs);
            }
        }

    }


    _showWorkspaceSwitcherPopup(toggle, passive = false) {
        if (Main.overview.visible || !this.settings.get_boolean('show-popup')) {
            return;
        }

        if (toggle) {
            this._addWorkspaceOverviewKeybindings();
        }

        this.monitors.forEach((monitor) => {
            let monitorIndex = monitor.index;

            const existing = this.wm._wsPopupList[monitorIndex];
            if (!existing || existing._fading) {
                this.wm._workspaceTracker.blockUpdates();
                const popup = this._createNewPopup({
                    monitorIndex: monitorIndex,
                    toggle: toggle,
                });
                this.wm._wsPopupList[monitorIndex] = popup;
                popup.connect('destroy', () => {
                    this.wm._workspaceTracker.unblockUpdates();
                    // A newer popup may have replaced this one while it was fading out.
                    if (this.wm._wsPopupList[monitorIndex] !== popup)
                        return;
                    this.wm._wsPopupList[monitorIndex] = null;
                    if (monitorIndex === Main.layoutManager.primaryIndex) {
                        this.wm._workspaceSwitcherPopup = null;
                        this.wm._isWorkspacePrepended = false;
                        if (toggle) {
                            this._removeWorkspaceOverviewKeybindings();
                        }
                    }
                });

                if (passive) {
                    // After a swipe: no modal grab, or it would swallow the next swipe.
                    popup.showPassive();
                } else if (monitorIndex !== Main.layoutManager.primaryIndex) {
                    // One grab for all monitors: a second one would take the mouse (#224).
                    popup.showPassive(false);
                } else {
                    let event = Clutter.get_current_event();
                    // gnome-shell's SwitcherPopup.show() seems to expect a modifier
                    // mask from a configured keybinding, not from an event's state.
                    // On Wayland, the event's state includes ambient modifiers like
                    // caps lock and numlock (Mod2) that generally wouldn't be part
                    // of a keybinding, so we clear those bits so that SwitcherPopup
                    // can close the popup when the relevant modifiers are released,
                    // instead of waiting for caps/num lock to be released.
                    const modifier_mask = Clutter.ModifierType.MODIFIER_MASK & ~Clutter.ModifierType.LOCK_MASK & ~Clutter.ModifierType.MOD2_MASK;
                    let modifiers = event ? event.get_state() & modifier_mask : 0;
                    this.wm._wsPopupList[monitorIndex].showToggle(false, null, modifiers, toggle);
                }
                if (monitorIndex === Main.layoutManager.primaryIndex) {
                    this.wm._workspaceSwitcherPopup = this.wm._wsPopupList[monitorIndex];
                }
            } else {
                // reset  of popup
                if (monitorIndex === Main.layoutManager.primaryIndex) {
                    this.wm._wsPopupList[monitorIndex].resetTimeout();
                }
            }
        });
    }

    _destroyWorkspaceSwitcherPopup() {
        this.wm._wsPopupList.filter(p => p).forEach(p => p.destroy());
    }

    _getTargetWorkspace(direction) {
        let newWs = this.wsManager.get_active_workspace().get_neighbor(direction);
        let currentIndex = this.wsManager.get_active_workspace_index();
        if (this.wraparoundMode !== WraparoundMode.NONE && currentIndex === newWs.index()) {
            // Given a direction input the workspace has not changed, so do wraparound.
            let targetRow = Math.floor(currentIndex / this.columns);
            let targetColumn = currentIndex % this.columns;

            let offset = 0;
            if (direction === Meta.MotionDirection.UP || direction === Meta.MotionDirection.LEFT) {
                offset = -1;
            } else if (direction === Meta.MotionDirection.DOWN || direction === Meta.MotionDirection.RIGHT) {
                offset = 1;
            }

            switch (this.wraparoundMode) {
                case WraparoundMode.NEXT_PREV_BORDER:
                    if ((currentIndex === 0 && offset === -1) || (currentIndex === this.rows * this.columns - 1 && offset === 1)) {
                        break;
                    }
                case WraparoundMode.NEXT_PREV:
                    targetRow += offset;
                    targetColumn += offset;
                    break;
                case WraparoundMode.ROW_COL:
                    if (direction === Meta.MotionDirection.UP || direction === Meta.MotionDirection.DOWN) {
                        targetRow += offset;
                    } else if (direction === Meta.MotionDirection.LEFT || direction === Meta.MotionDirection.RIGHT) {
                        targetColumn += offset;
                    }
                default:
                    // Nothing.
            }

            // Handle negative targets.
            targetColumn = (targetColumn + this.columns) % this.columns;
            targetRow = (targetRow + this.rows) % this.rows;

            let target = targetRow * this.columns + targetColumn;
            newWs = this.wsManager.get_workspace_by_index(target);
        }

        return newWs;
    }

    _createNewPopup(options) {
        options = options || {};
        options.scale = this.settings.get_double('scale');
        options.showThumbnails = this.settings.get_boolean('show-thumbnails');
        options.showWorkspaceNames = this.settings.get_boolean('show-workspace-names');
        options.popupTimeout = this.settings.get_int('popup-timeout')
        options.enablePopupWorkspaceHover = this.settings.get_boolean('enable-popup-workspace-hover');
        options.overveiwKeybindingActions = this._overviewKeybindingActions;
        options.toggleAction = this._toggleAction;

        return new WorkspaceSwitcherPopup(options, this);
    }

    _moveToWorkspace(direction) {
      let workspace = this._getTargetWorkspace(direction);
      this.wm.actionMoveWorkspace(workspace);
   }

   _workspaceOverviewMoveRight() {
      this._moveToWorkspace(Meta.MotionDirection.RIGHT);
   }

   _workspaceOverviewMoveLeft() {
      this._moveToWorkspace(Meta.MotionDirection.LEFT);
   }

   _workspaceOverviewMoveUp() {
      this._moveToWorkspace(Meta.MotionDirection.UP);
   }

   _workspaceOverviewMoveDown() {
      this._moveToWorkspace(Meta.MotionDirection.DOWN);
   }
}
