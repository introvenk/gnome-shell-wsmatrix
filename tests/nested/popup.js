
// Keyboard switching and the switcher popup. Needs a grid of at least 2x2.
function scenario(ext, T) {
    const c = T.columns();
    return [
        [3000, () => T.switch('right')],
        [3060, () => T.shot('popup-entrance')],
        [3300, () => T.shot('popup-settled')],
        [3350, () => T.expect('right moves one column', T.active(), 1)],
        [3400, () => T.switch('down')],
        [3700, () => T.expect('down moves one row', T.active(), 1 + c)],
        [3750, () => T.shot('popup-indicator-moved')],
        // Rapid presses must not lose the popup or land on the wrong workspace.
        [5000, () => T.switch('right')],
        [5040, () => T.switch('left')],
        [5080, () => T.switch('up')],
        [5120, () => T.switch('down')],
        [5600, () => T.expect('rapid presses net zero', T.active(), 1 + c)],
        [5650, () => T.shot('popup-after-rapid')],
    ];
}
