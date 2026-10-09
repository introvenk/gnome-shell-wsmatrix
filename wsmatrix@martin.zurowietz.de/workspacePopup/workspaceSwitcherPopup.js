import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';
import WorkspaceSwitcherPopupList from "./workspaceSwitcherPopupList.js";
import WorkspaceThumbnail from "./workspaceThumbnail.js";
import {SwitcherPopup} from 'resource:///org/gnome/shell/ui/switcherPopup.js';

let modals = [];

const ENTRANCE_TIME = 120;
const ENTRANCE_SCALE = 0.96;
const INDICATOR_TIME = 150;
// Accumulated scroll distance that moves the selection by one cell.
const SCROLL_STEP = 1;
// How long a popup stays up when the timeout is 0 but there are no keys to release.
const FALLBACK_TIMEOUT = 500;
const BLUR_RADIUS = 40;
// Background blur is rectangular; insetting it by this fraction of the corner radius keeps
// its corners inside the rounded popup outline (1 - 1/sqrt(2) ~= 0.29).
const BLUR_CORNER_INSET = 0.3;

function reducedMotion() {
    return St.Settings.get().reducedMotion === St.ReducedMotion.REDUCE;
}

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
        this._toggleAction = options.toggleAction;
        this._items = this._createThumbnails();
        this._switcherList = new WorkspaceSwitcherPopupList(this._items, this._createLabels(), options);
        this._overviewKeybindingActions = options.overveiwKeybindingActions;
        this._noModsTimeoutId = 0;

        this._backdrop = new St.Widget({
            name: 'wsmatrix-backdrop',
            effect: new Shell.BlurEffect({mode: Shell.BlurMode.BACKGROUND, radius: BLUR_RADIUS, brightness: 0.9}),
        });

        // Ring that glides between cells; drawn above the list, moved by translation only.
        this._indicator = new St.Widget({name: 'wsmatrix-indicator', style_class: 'ws-switcher-selection', opacity: 0});
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

    // Replaces the shell's handler, which only reads dy and moves once per event, so a
    // touchpad swipe skipped many workspaces and horizontal swipes were ignored.
    _onScroll(_controller, _sprite, _source, dx, dy) {
        this._disableHover();
        this._scrollX = (this._scrollX ?? 0) + dx;
        this._scrollY = (this._scrollY ?? 0) + dy;

        const horizontal = Math.abs(this._scrollX) > Math.abs(this._scrollY);
        const delta = horizontal ? this._scrollX : this._scrollY;
        if (Math.abs(delta) < SCROLL_STEP)
            return Clutter.EVENT_STOP;

        this._scrollX = this._scrollY = 0;
        const direction = horizontal
            ? (delta > 0 ? Meta.MotionDirection.RIGHT : Meta.MotionDirection.LEFT)
            : (delta > 0 ? Meta.MotionDirection.DOWN : Meta.MotionDirection.UP);
        this._select(this._wm._getTargetWorkspace(direction).index());
        return Clutter.EVENT_STOP;
    }

    _itemEnteredHandler(n) {
        if (this._enablePopupWorkspaceHover) {
            this._select(n);
        }
    }

    showToggle(backward, binding, mask, toggle) {
        this._toggle = toggle;
        if (this._popupTimeout > 0 || this._toggle) {
            mask = 0
        }
        // With no modifiers to release (e.g. a switch during a drag) only a timeout can
        // close the popup; without one it kept the keyboard grab forever (#200, #250).
        if (!this._toggle && mask === 0)
            this._popupTimeout ||= FALLBACK_TIMEOUT;
        this.resetTimeout();

        // Before show(): it finishes right away when the modifiers are already released.
        modals.push(this);
        if (!this.show(backward, binding, mask)) {
            modals = modals.filter(m => m !== this);
            return;
        }
        if (this._fading)
            return;

        this.insert_child_below(this._backdrop, this._switcherList);
        this.add_child(this._indicator);
        // Force a layout pass like SwitcherPopup.show() does, so the new children are
        // allocated before the entrance transitions start.
        this.get_allocation_box();
        this._showImmediately();
        this._animateEntrance();
    }

    // Shown after a touchpad swipe: without a modal grab, which would swallow the next
    // swipe, and closed by the timeout since there are no keys to release.
    showPassive() {
        if (this._items.length === 0)
            return;

        this.reactive = false;
        this._popupTimeout ||= FALLBACK_TIMEOUT;
        this.add_child(this._switcherList);
        this.insert_child_below(this._backdrop, this._switcherList);
        this.add_child(this._indicator);
        this.visible = true;
        this.get_allocation_box();
        this._initialSelection(false, null);
        this.resetTimeout();
        this._animateEntrance();
        modals.push(this);
    }

    fadeAndDestroy() {
        this._fading = true;
        super.fadeAndDestroy();
    }

    _animateEntrance() {
        const list = this._switcherList;
        this.opacity = 0;

        const params = {duration: ENTRANCE_TIME, mode: Clutter.AnimationMode.EASE_OUT_QUAD};
        this.ease({opacity: 255, ...params});
        // Reduced motion keeps the fades, drops the movement (as the shell's own popups do).
        if (!reducedMotion()) {
            list.set_pivot_point(0.5, 0.5);
            list.set_scale(ENTRANCE_SCALE, ENTRANCE_SCALE);
            list.ease({scale_x: 1, scale_y: 1, ...params});
        }
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
        if (animate && this._indicatorPlaced && !reducedMotion()) {
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
            for (const key in this._overviewKeybindingActions) {
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

            // The shortcut that opened the popup closes it, also when confirm is bound
            // to the same keys and so never reaches the loop above (#265).
            if (_action === this._toggleAction) {
                this.fadeAndDestroy();
                return Clutter.EVENT_STOP;
            }
        }

        for (let key in Meta.KeyBindingAction) {
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
        if (!this._backdrop.get_parent())
            this._backdrop.destroy();

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

        if (this._backdrop.get_parent() === this) {
            const radius = this._switcherList.get_theme_node().get_border_radius(St.Corner.TOPLEFT);
            const inset = Math.ceil(radius * BLUR_CORNER_INSET);
            this._backdrop.allocate(new Clutter.ActorBox({
                x1: childBox.x1 + inset, y1: childBox.y1 + inset,
                x2: childBox.x2 - inset, y2: childBox.y2 - inset,
            }));
        }

        if (this._indicator.get_parent() === this) {
            // Always allocate (empty until the target cell is laid out); an unallocated
            // child makes Clutter warn and skip stage view updates for the popup.
            const target = this._indicatorTarget();
            this._indicator.allocate(new Clutter.ActorBox({
                x1: 0, y1: 0, x2: target?.width ?? 0, y2: target?.height ?? 0,
            }));
            if (target && !this._indicator.get_transition('translation-x'))
                this._updateIndicator(false);
        }
    }
});
