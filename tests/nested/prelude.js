
// ---- Test harness, appended to a copy of extension.js by run.sh. Never shipped. ----
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Shell from 'gi://Shell';
import * as TMain from 'resource:///org/gnome/shell/ui/main.js';

const T = {
    main: TMain,
    log: msg => console.log(`WSMTEST ${msg}`),
    expect(name, actual, expected) {
        const ok = JSON.stringify(actual) === JSON.stringify(expected);
        T.log(`${ok ? 'PASS' : 'FAIL'} ${name}: got ${JSON.stringify(actual)}${ok ? '' : `, expected ${JSON.stringify(expected)}`}`);
    },
    shot(name) {
        const file = Gio.File.new_for_path(`@OUT@/shots/${name}.png`);
        const stream = file.replace(null, false, 0, null);
        new Shell.Screenshot().screenshot(false, stream)
            .then(() => stream.close(null))
            .catch(e => T.log(`ERR screenshot ${e}`));
    },
    active: () => global.workspace_manager.get_active_workspace_index(),
    goTo: i => global.workspace_manager.get_workspace_by_index(i).activate(global.get_current_time()),
    rows: () => global.workspace_manager.layout_rows,
    columns: () => global.workspace_manager.layout_columns,
    popup: () => TMain.wm._wsPopupList.find(p => p),
};

const _origEnable = WsmatrixExtension.prototype.enable;
let _started = false;
WsmatrixExtension.prototype.enable = function () {
    // The layout as the shell had it before the extension first touched it.
    T.initialLayout ??= [global.workspace_manager.layout_rows, global.workspace_manager.layout_columns];
    _origEnable.call(this);
    // Scenarios disable and re-enable the extension; run the steps only once.
    if (_started)
        return;
    _started = true;

    const ext = this;
    T.switch = dir => ext.overrideWorkspace._showWorkspaceSwitcher(
        global.display, null, null, `switch-to-workspace-${dir}`);

    // Steps are [ms after startup, fn]. Start with the overview closed on workspace 0.
    const steps = [[1500, () => TMain.overview.hide()], [2000, () => T.goTo(0)], ...scenario(ext, T)];
    const end = Math.max(...steps.map(([ms]) => ms)) + 1000;
    steps.push([end, () => T.log('DONE')], [end + 500, () => global.context.terminate()]);
    const run = () => {
        for (const [ms, fn] of steps) {
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
                try {
                    fn();
                } catch (e) {
                    T.log(`ERR ${e}\n${e.stack}`);
                }
                return GLib.SOURCE_REMOVE;
            });
        }
    };
    // The shell opens the overview once startup completes; start the clock after that.
    if (TMain.layoutManager._startingUp)
        TMain.layoutManager.connect('startup-complete', run);
    else
        run();
};
