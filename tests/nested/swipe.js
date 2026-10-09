
// Touchpad swipes, simulated by emitting the swipe trackers' signals.
// Needs a grid of at least 2x2.
function scenario(ext, T) {
    const c = T.columns();
    const ctl = () => T.main.wm._workspaceAnimation;
    const settings = ext.getSettings();
    const verticalBefore = settings.get_boolean('vertical-swipe');
    const shellTracker = () => T.main.wm._overrideProperties?._workspaceAnimation?._swipeTracker;
    let original;

    // Swipe to the next workspace along the tracker's axis.
    const swipe = tracker => {
        tracker.emit('begin', 0);
        const group = ctl()._switchData.baseMonitorGroup;
        const points = group.getSnapPoints();
        const next = points[points.indexOf(group.progress) + 1];
        tracker.emit('update', next);
        // Zero duration: an eased finish only advances while the nested window draws
        // frames, which stalls when it's hidden behind other windows.
        tracker.emit('end', 0, next);
    };

    return [
        [2500, () => {
            original = shellTracker();
            T.expect('the shell swipe tracker is muted', original._allowedModes, 0);
        }],
        [3000, () => swipe(ctl()._swipeTracker)],
        [3400, () => T.expect('horizontal swipe moves one column', T.active(), 1)],
        [3450, () => T.expect('a popup follows the swipe', !!T.popup(), true)],
        [3500, () => T.shot('swipe-horizontal')],
        [4000, () => settings.set_boolean('vertical-swipe', true)],
        [4100, () => T.expect('vertical swipe takes over the overview gesture',
            T.main.overview._swipeTracker._allowedModes, 0)],
        [4500, () => swipe(ctl()._verticalSwipeTracker)],
        [4900, () => T.expect('vertical swipe moves one row', T.active(), 1 + c)],
        [5500, () => settings.set_boolean('vertical-swipe', false)],
        [5600, () => T.expect('turning it off restores the overview gesture',
            T.main.overview._swipeTracker._allowedModes !== 0, true)],
        [6000, () => ext.disable()],
        [6100, () => T.expect('disable restores the shell swipe tracker',
            original._allowedModes !== 0, true)],
        [6200, () => {
            ext.enable();
            settings.set_boolean('vertical-swipe', verticalBefore);
        }],
    ];
}
