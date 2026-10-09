
// Run with MONITORS=2. One grab for all popups (#224), closing closes every
// popup (#253), and the overview grid on the second monitor (#255).
function scenario(ext, T) {
    const popups = () => T.main.wm._wsPopupList.filter(p => p && !p._fading);
    const NORMAL = 1;

    return [
        [2500, () => T.expect('two monitors', T.main.layoutManager.monitors.length, 2)],
        [3000, () => ext.overrideWorkspace._showWorkspaceSwitcherPopup(true)],
        [3500, () => {
            T.expect('a popup on each monitor', popups().length, 2);
            T.expect('only the primary popup holds the grab',
                popups().map(p => !!p._haveModal), [true, false]);
            T.shot('two-popups');
        }],
        // An outside click makes the shell fade out the popup that holds the grab.
        [4000, () => popups().find(p => p._haveModal).fadeAndDestroy()],
        [4800, () => T.expect('closing one popup closes all of them', popups().length, 0)],
        [4850, () => T.expect('keyboard grab is released', T.main.actionMode, NORMAL)],
        [5000, () => T.main.overview.show()],
        [6500, () => {
            const display = T.main.overview._overview._controls._workspacesDisplay._workspacesViews[1];
            const thumbs = display._thumbnails;
            const bottom = Math.max(...thumbs._thumbnails.map(t => t.y + t.height));
            T.expect('secondary strip covers every row', thumbs.height >= bottom, true);
            T.expect('secondary workspaces start below the strip',
                display._workspacesView.allocation.y1 >= thumbs.allocation.y2, true);
            T.shot('overview-two-monitors');
        }],
    ];
}
