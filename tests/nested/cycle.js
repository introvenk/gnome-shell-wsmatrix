
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
    ];
}
