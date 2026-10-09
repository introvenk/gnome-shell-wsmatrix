
// Overview grid: drop targets, clicks, strip size, switches and the app grid.
// Needs a grid of at least 2x2.
function scenario(ext, T) {
    const c = T.columns();
    const box = () => T.main.overview._overview._controls._thumbnailsBox;
    const view = () => T.main.overview._overview._controls._workspacesDisplay._workspacesViews[0];
    const center = t => [t.x + t.width / 2, t.y + t.height / 2];
    const visible = () => view()._workspaces.map((w, i) => w.visible ? i : -1).filter(i => i >= 0);
    const rowOf = i => Math.floor(i / c);

    return [
        [2500, () => T.main.overview.show()],
        [3500, () => T.shot('overview')],
        [3600, () => {
            const b = box();
            const targets = b._thumbnails.map(t => {
                try {
                    b.handleDragOver({metaWindow: {}}, null, ...center(t), 0);
                } catch {
                    // The fake drag source fails after the target is picked.
                }
                return b._dropWorkspace;
            });
            b._dropWorkspace = -1;
            T.expect('drops land on the thumbnail under the pointer', targets, targets.map((_, i) => i));
        }],
        [3700, () => {
            const b = box();
            const bottom = Math.max(...b._thumbnails.map(t => t.y + t.height));
            T.expect('thumbnail strip covers every row', b.height >= bottom, true);
        }],
        [3800, () => T.expect('only the active row is shown at rest',
            visible().every(i => rowOf(i) === 0), true)],
        [3900, () => T.expect('the view clips other rows', view().clip_to_allocation, true)],
        [4000, () => T.goTo(1 + c)],
        [4120, () => T.shot('overview-diagonal-switch')],
        [4130, () => T.expect('only the two rows in the switch are shown',
            visible().every(i => rowOf(i) <= 1), true)],
        [5000, () => T.shot('overview-after-switch')],
        [5100, () => T.goTo(0)],
        [6000, () => {
            T.main.overview.dash.showAppsButton.checked = true;
        }],
        [7500, () => T.shot('app-grid')],
        [7600, () => {
            T.main.overview.dash.showAppsButton.checked = false;
        }],
        // Clicking activates the workspace and closes the overview, so this goes last.
        [8500, () => {
            const b = box();
            const picked = b._thumbnails.map(t => {
                b._activateThumbnailAtPoint(...center(t), global.get_current_time());
                return T.active();
            });
            T.expect('clicks open the thumbnail under the pointer', picked, picked.map((_, i) => i));
        }],
    ];
}
