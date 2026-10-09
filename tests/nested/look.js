
// Renders only the Activities grid in a few states, for looking at it (make look).
// Each shot is the Activities button at native pixels; montage.py puts them together.
function scenario(ext, T) {
    const settings = ext.getSettings();
    const before = [settings.get_int('num-rows'), settings.get_int('num-columns')];
    let n = 0;
    const grab = label => () => {
        const [x, y] = T.main.panel.statusArea.activities.get_transformed_position();
        const [w, h] = T.main.panel.statusArea.activities.get_transformed_size();
        const name = `${String(n++).padStart(2, '0')}-${label}`;
        const file = Gio.File.new_for_path(`${T.out}/shots/${name}.png`);
        const stream = file.replace(null, false, 0, null);
        new Shell.Screenshot().screenshot_area(Math.floor(x) - 2, Math.floor(y), Math.ceil(w) + 4, Math.ceil(h), stream)
            .then(() => stream.close(null))
            .catch(e => T.log(`ERR screenshot ${e}`));
    };
    const grid = (rows, columns) => () => {
        settings.set_int('num-rows', rows);
        settings.set_int('num-columns', columns);
    };

    return [
        [2500, () => T.goTo(4)],
        [3200, grab('3x3 active centre')],
        [3300, () => T.goTo(0)],
        [3400, grab('3x3 gliding to corner')],
        [4000, grab('3x3 active corner')],
        [4500, grid(2, 2)],
        [5300, grab('2x2')],
        [5500, grid(2, 4)],
        [6300, grab('2x4')],
        [6500, grid(4, 4)],
        [7300, () => T.goTo(5)],
        [8000, grab('4x4')],
        [8200, grid(5, 5)],
        [9000, () => T.goTo(12)],
        [9700, grab('5x5')],
        [9900, grid(...before)],
    ];
}
