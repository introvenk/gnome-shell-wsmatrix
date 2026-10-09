
// Touchpad scrolling on an open popup. Needs a grid of at least 2x2.
function scenario(ext, T) {
    const c = T.columns();
    const scroll = (dx, dy) => T.popup()._onScroll(null, null, null, dx, dy);
    return [
        [3000, () => T.switch('right')],
        [3100, () => scroll(0, 0.4)],
        [3110, () => scroll(0, 0.4)],
        [3120, () => T.expect('small deltas accumulate before moving', T.active(), 1)],
        [3130, () => scroll(0, 0.4)],
        [3150, () => T.expect('a full step moves one row', T.active(), 1 + c)],
        [3200, () => scroll(-1.1, 0.1)],
        [3220, () => T.expect('horizontal scroll moves one column', T.active(), c)],
    ];
}
