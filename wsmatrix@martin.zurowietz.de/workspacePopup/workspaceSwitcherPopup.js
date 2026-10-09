import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import St from 'gi://St';
import WorkspaceSwitcherPopupList from "./workspaceSwitcherPopupList.js";
import WorkspaceThumbnail from "./workspaceThumbnail.js";
import {SwitcherPopup} from 'resource:///org/gnome/shell/ui/switcherPopup.js';

var modals = [];

const ENTRANCE_TIME = 120;
const ENTRANCE_SCALE = 0.96;
const INDICATOR_TIME = 150;

export default GObject.registerClass(
class WorkspaceSwitcherPopup extends SwitcherPopup {
    _init(options, wm) {
        super._init();
        this._monitorIndex = options.monitorIndex;
        this._monitor = Main.layoutManager.monitors[this._monitorIndex];
        this._scale = options.scale;
        this._popupTimeout = options.popupTimeout;
        this._enablePopupWorkspaceHover = options.enablePopupWorkspaceHover;
        this._wm = wm;
        this._toggle = options.toggle || false;
        this._items = this._createThumbnails();
        this._switcherList = new WorkspaceSwitcherPopupList(this._items, this._createLabels(), options);
        this._overviewKeybindingActions = options.overveiwKeybindingActions;
        this._noModsTimeoutId = 0;

        // Ring that glides between cells; drawn above the list, moved by translation only.
        this._indicator = new St.Widget({style_class: 'ws-switcher-selection', opacity: 0});
        this._switcherList.connect('highlight-changed', () => this._updateIndicator(true));

        // Initially disable hover so we ignore the enter-event if
        // the switcher appears underneath the current pointer location
        this._disableHover();
    }

    _createThumbnails() {
        let thumbnails = [];
        let workspaceManager = global.workspace_manager;

        for (let i = 0; i < workspaceManager.n_workspaces; i++) {
            let workspace = workspaceManager.get_workspace_by_index(i);
            let thumbnail = new WorkspaceThumbnail(workspace, this._monitorIndex)
            thumbnails.push(thumbnail);
        }

        return thumbnails;
    }

    _createLabels() {
        let labels = [];
        let workspaceManager = global.workspace_manager;

        for (let i = 0; i < workspaceManager.n_workspaces; i++) {
            let label = Meta.prefs_get_workspace_name(i);
            labels.push(label);
        }

        return labels;
    }

    // initial selection of workspace in the popup, if not implemented, a movement to current workspace will occur everytime the popup shows up
    _initialSelection(backward, _binding) {
        let workspaceManager = global.workspace_manager;
        this._switcherList.highlight(workspaceManager.get_active_workspace_index());
    }

    // select next workspace (used while scrolling the switcher popup with the mouse wheel)
    _next() {
        let workspaceManager = global.workspace_manager;
        return Math.min(workspaceManager.get_active_workspace_index() + 1, workspaceManager.n_workspaces - 1);
    }

    // select previous workspace (used while scrolling the switcher popup with the mouse wheel)
    _previous() {
        let workspaceManager = global.workspace_manager;
        return Math.max(workspaceManager.get_active_workspace_index() - 1, 0);
    }

    // on workspace selected (in switcher popup)
    _select(num) {
        this.selectedIndex = num;
        this._switcherList.highlight(num);

        // on item selected, switch/move to the workspace
        let workspaceManager = global.workspace_manager;
        let wm = Main.wm;
        let newWs = workspaceManager.get_workspace_by_index(this.selectedIndex);
        wm.actionMoveWorkspace(newWs);
    }

    _itemEnteredHandler(n) {
        if (this._enablePopupWorkspaceHover) {
            this._select(n);
        }
    }

    showToggle(backward, binding, mask, toggle) {
        this.resetTimeout();

        this._toggle = toggle;
        if (this._popupTimeout > 0 || this._toggle) {
            mask = 0
        }

        if (this.show(backward, binding, mask)) {
            this.add_child(this._indicator);
            this._showImmediately();
            this._animateEntrance();
            modals.push(this);
        }
    }

    fadeAndDestroy() {
        this._fading = true;
        super.fadeAndDestroy();
    }

    _animateEntrance() {
        const list = this._switcherList;
        list.set_pivot_point(0.5, 0.5);
        list.set_scale(ENTRANCE_SCALE, ENTRANCE_SCALE);
        this.opacity = 0;

        const params = {duration: ENTRANCE_TIME, mode: Clutter.AnimationMode.EASE_OUT_QUAD};
        this.ease({opacity: 255, ...params});
        list.ease({scale_x: 1, scale_y: 1, ...params});
        // The ring follows once the list has settled so it never sits on a scaling cell.
        this._indicator.ease({opacity: 255, delay: ENTRANCE_TIME, ...params});
    }

    _indicatorTarget() {
        const list = this._switcherList;
        const item = list._items[list._highlighted];
        if (!item || !item.has_allocation())
            return null;

        const row = item.get_parent();
        return {
            x: list.x + row.x + item.x,
            y: list.y + row.y + item.y,
            width: item.width,
            height: item.height,
        };
    }

    _updateIndicator(animate) {
        const target = this._indicatorTarget();
        if (!target)
            return;

        this._indicator.set_size(target.width, target.height);
        if (animate && this._indicatorPlaced) {
            this._indicator.ease({
                translation_x: target.x,
                translation_y: target.y,
                duration: INDICATOR_TIME,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        } else {
            this._indicator.translation_x = target.x;
            this._indicator.translation_y = target.y;
        }
        this._indicatorPlaced = true;
    }

    _resetNoModsTimeout() {
        // Disable this function so the custom timeout works.
    }

    resetTimeout() {
        modals.filter(m => m).forEach(m => {
            if (m._noModsTimeoutId !== 0) {
                GLib.source_remove(m._noModsTimeoutId);
                m._noModsTimeoutId = 0;
            }
        });

        if (this._popupTimeout > 0 && !this._toggle) {
            this._noModsTimeoutId = GLib.timeout_add(
                GLib.PRIORITY_DEFAULT,
                this._popupTimeout,
                () => {
                    this._finish(global.display.get_current_time_roundtrip());
                    this._noModsTimeoutId = 0;
                    return GLib.SOURCE_REMOVE;
                });
        }
    }

    _keyPressHandler(_keysym, _action) {
        if (this._toggle) {
            for (var key in this._overviewKeybindingActions) {
                if (this._overviewKeybindingActions[key] === _action) {
                    switch (key) {
                        case 'right':
                            this._wm._workspaceOverviewMoveRight();
                            break;
                        case 'left':
                            this._wm._workspaceOverviewMoveLeft();
                            break;
                        case 'up':
                            this._wm._workspaceOverviewMoveUp();
                            break;
                        case 'down':
                            this._wm._workspaceOverviewMoveDown();
                            break;
                        case 'confirm':
                            this.fadeAndDestroy();
                            break;
                    }

                    return Clutter.EVENT_STOP;
                }
            }
        }

        for (var key in Meta.KeyBindingAction) {
            let value = Meta.KeyBindingAction[key];
            if (value == _action) {
                key = key.toLowerCase();
                if (key.startsWith('workspace_')) {
                    key = 'switch-to-workspace-' + key.replace('workspace_', '');
                }

                if (key.startsWith('move_to_workspace_')) {
                    key = 'move-to-workspace-' + key.replace('move_to_workspace_', '');
                }

                this._wm._showWorkspaceSwitcher(global.display, global.display.focus_window, null, key);
            }
        }

        return Clutter.EVENT_PROPAGATE;
    }

    _finish(_timestamp) {
        this._disableHover();
        while (modals.length > 0) {
            const m = modals.pop();
            if (!m._fading)
                m.fadeAndDestroy();
        }
    }

    _onDestroy() {
        if (this._noModsTimeoutId != 0) {
            GLib.source_remove(this._noModsTimeoutId);
            this._noModsTimeoutId = 0;
        }

        if (!this._indicator.get_parent())
            this._indicator.destroy();

        this._items.forEach((x) => x.destroy());
        this._items = [];

        super._onDestroy();

        modals = modals.filter(m => m !== this);
    }

    vfunc_allocate(box) {
        this.set_allocation(box);
        let childBox = new Clutter.ActorBox();

        let leftPadding = this.get_theme_node().get_padding(St.Side.LEFT);
        let rightPadding = this.get_theme_node().get_padding(St.Side.RIGHT);
        let hPadding = leftPadding + rightPadding;

        // Allocate the switcherList
        // We select a size based on an icon size that does not overflow the screen
        let [, childNaturalHeight] = this._switcherList.get_preferred_height(this._monitor.width - hPadding);
        let [, childNaturalWidth] = this._switcherList.get_preferred_width(childNaturalHeight);
        childBox.x1 = Math.max(this._monitor.x + leftPadding, this._monitor.x + Math.floor((this._monitor.width - childNaturalWidth) / 2));
        childBox.x2 = Math.min(this._monitor.x + this._monitor.width - rightPadding, childBox.x1 + childNaturalWidth);
        childBox.y1 = this._monitor.y + Math.floor((this._monitor.height - childNaturalHeight) / 2);
        childBox.y2 = childBox.y1 + childNaturalHeight;
        this._switcherList.allocate(childBox);

        if (this._indicator.get_parent() === this) {
            const target = this._indicatorTarget();
            if (target) {
                this._indicator.allocate(new Clutter.ActorBox({x1: 0, y1: 0, x2: target.width, y2: target.height}));
                if (!this._indicator.get_transition('translation-x'))
                    this._updateIndicator(false);
            }
        }
    }
});
