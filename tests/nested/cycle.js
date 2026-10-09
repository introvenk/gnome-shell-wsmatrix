
// Disabling and re-enabling (what lock/unlock does) must leave everything working.
function scenario(ext, T) {
    const c = T.columns();
    const cycle = () => {
        ext.disable();
        ext.enable();
    };
    return [
        [3000, () => T.switch('right')],
        [4000, cycle],
        [4500, () => T.switch('down')],
        [4900, () => T.expect('switching works after re-enable', T.active(), 1 + c)],
        [5000, () => T.shot('after-cycle')],
        [5500, cycle],
        [6000, () => T.switch('left')],
        [6400, () => T.expect('switching works after second re-enable', T.active(), c)],
        // Disabling restores the shell's layout (#216) and leaves a working overview (#179).
        [7000, () => T.main.overview.show()],
        [8000, () => ext.disable()],
        [8100, () => T.expect('layout restored on disable',
            [global.workspace_manager.layout_rows, global.workspace_manager.layout_columns], T.initialLayout)],
        [8200, () => T.main.overview.hide()],
        [9000, () => T.main.overview.show()],
        [10000, () => T.shot('overview-after-disable')],
        [10100, () => T.expect('overview opens after disable', T.main.overview.visible, true)],
        [10500, () => T.main.overview.hide()],
        [11000, () => ext.enable()],
    ];
}
