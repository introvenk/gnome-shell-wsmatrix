import Clutter from 'gi://Clutter';
import Meta from 'gi://Meta';
import St from 'gi://St';
import {addBackground} from '../workspacePopup/workspaceThumbnail.js';
import Override from '../Override.js';
import {
    ThumbnailsBox as GThumbnailsBox
} from 'resource:///org/gnome/shell/ui/workspaceThumbnail.js';


const vfunc_get_preferred_height = function (forWidth) {
    const workspaceManager = global.workspace_manager;
    const rows = workspaceManager.layout_rows;
    const columns = workspaceManager.layout_columns;

    let themeNode = this.get_theme_node();

    forWidth = themeNode.adjust_for_width(forWidth);

    let spacing = themeNode.get_length('spacing');
    let totalSpacing = (columns - 1) * spacing;

    const avail = forWidth - totalSpacing;

    let scale = (avail / columns) / this._porthole.width;
    scale = Math.min(scale, this._maxThumbnailScale);

    const height = Math.round(this._porthole.height * scale) * rows + (rows - 1) * spacing;
    return themeNode.adjust_preferred_height(height, height);
}

const vfunc_get_preferred_width = function (_forHeight) {
    const workspaceManager = global.workspace_manager;
    const rows = workspaceManager.layout_rows;
    const columns = workspaceManager.layout_columns;

    // Note that for getPreferredHeight/Width we cheat a bit and skip propagating
    // the size request to our children because we know how big they are and know
    // that the actors aren't depending on the virtual functions being called.
    let themeNode = this.get_theme_node();

    let spacing = themeNode.get_length('spacing');
    let totalSpacing = (columns - 1) * spacing;

    const naturalWidth = this._thumbnails.reduce((accumulator, thumbnail, index) => {
        let workspaceSpacing = 0;

        if (index > 0)
            workspaceSpacing += spacing / 2;
        if (index < this._thumbnails.length - 1)
            workspaceSpacing += spacing / 2;

        const progress = 1 - thumbnail.collapse_fraction;
        const width = (this._porthole.width * this._maxThumbnailScale + workspaceSpacing) * progress;
        return accumulator + width;
    }, 0);

    return themeNode.adjust_preferred_width(totalSpacing, naturalWidth);
}

const vfunc_allocate = function(box) {
    this.set_allocation(box);

    const workspaceManager = global.workspace_manager;
    const rows = workspaceManager.layout_rows;
    const columns = workspaceManager.layout_columns;
    const activeIndex = workspaceManager.get_active_workspace_index();

    let rtl = Clutter.get_default_text_direction() == Clutter.TextDirection.RTL;

    if (this._thumbnails.length === 0) // not visible
            return;

    let themeNode = this.get_theme_node();
    box = themeNode.get_content_box(box);

    const portholeWidth = this._porthole.width;
    const portholeHeight = this._porthole.height;
    const spacing = themeNode.get_length('spacing');

    // Compute the scale we'll need once everything is updated,
    // unless we are currently transitioning
    if (this._expandFraction === 1) {
        const totalSpacing = (columns - 1) * spacing;
        const availableWidth = (box.get_width() - totalSpacing) / columns;

        const hScale = availableWidth / portholeWidth;
        const availableHeight = (box.get_height() - (rows - 1) * spacing) / rows;
        const vScale = availableHeight / portholeHeight;
        const newScale = Math.min(hScale, vScale);

        if (newScale !== this._targetScale) {
            if (this._targetScale > 0) {
                // We don't ease immediately because we need to observe the
                // ordering in queueUpdateStates - if workspaces have been
                // removed we need to slide them out as the first thing.
                this._targetScale = newScale;
                this._pendingScaleUpdate = true;
            } else {
                this._targetScale = this._scale = newScale;
            }

            this._queueUpdateStates();
        }
    }

    const ratio = portholeWidth / portholeHeight;
    const thumbnailFullHeight = Math.round(portholeHeight * this._scale);
    const thumbnailWidth = Math.round(thumbnailFullHeight * ratio);
    const thumbnailHeight = thumbnailFullHeight * this._expandFraction;
    const roundedVScale = thumbnailHeight / portholeHeight;

    // We always request size for maxThumbnailScale, distribute
    // space evently if we use smaller thumbnails

    const extraWidth =
        (this._maxThumbnailScale * portholeWidth - thumbnailWidth) * columns;
    box.x1 += Math.round(extraWidth / 2);
    box.x2 -= Math.round(extraWidth / 2);
    box.y2 = box.y1 + thumbnailHeight * rows + (rows - 1) * spacing;

    // The scroll value walks through every index between the old and new workspace,
    // so following floor/ceil of it slides the indicator along the row and wraps.
    // Remember the switch endpoints and move straight between their thumbnails.
    const indicatorValue = this._scrollAdjustment.value;
    if (this._wsmatrixIndicatorTo !== activeIndex) {
        this._wsmatrixIndicatorFrom = this._wsmatrixIndicatorTo ?? activeIndex;
        this._wsmatrixIndicatorTo = activeIndex;
    }
    const thumbnailBoxes = [];

    let indicatorThemeNode = this._indicator.get_theme_node();
    let indicatorTopFullBorder = indicatorThemeNode.get_padding(St.Side.TOP) + indicatorThemeNode.get_border_width(St.Side.TOP);
    let indicatorBottomFullBorder = indicatorThemeNode.get_padding(St.Side.BOTTOM) + indicatorThemeNode.get_border_width(St.Side.BOTTOM);
    let indicatorLeftFullBorder = indicatorThemeNode.get_padding(St.Side.LEFT) + indicatorThemeNode.get_border_width(St.Side.LEFT);
    let indicatorRightFullBorder = indicatorThemeNode.get_padding(St.Side.RIGHT) + indicatorThemeNode.get_border_width(St.Side.RIGHT);

    let x = box.x1;
    let y = box.y1;

    if (this._dropPlaceholderPos == -1) {
        this._dropPlaceholder.allocate_preferred_size(
            ...this._dropPlaceholder.get_position());

        // Only schedule a compositor callback if the placeholder is actually
        // visible. Without this guard, a BEFORE_REDRAW later is added on
        // every allocation pass, preventing the GPU from going idle.
        if (this._dropPlaceholder.visible) {
            const laters = global.compositor.get_laters();
            laters.add(Meta.LaterType.BEFORE_REDRAW, () => {
                this._dropPlaceholder.hide();
            });
        }
    }

    let childBox = new Clutter.ActorBox();

    for (let i = 0; i < this._thumbnails.length; i++) {
        const thumbnail = this._thumbnails[i];
        if (i % columns > 0) {
            x += spacing - Math.round(thumbnail.collapse_fraction * spacing);
        } else {
            x = Math.round(box.x1 + (box.get_width() - Math.round(spacing - thumbnail.collapse_fraction * spacing + thumbnailWidth) * columns) / 2);
        }

        const y1 = y;
        const y2 = y1 + thumbnailHeight;

        if (i === this._dropPlaceholderPos) {
            const [, placeholderWidth] = this._dropPlaceholder.get_preferred_width(-1);
            childBox.y1 = y1;
            childBox.y2 = y2;

            if (rtl) {
                childBox.x2 = box.x2 - Math.round(x);
                childBox.x1 = box.x2 - Math.round(x + placeholderWidth);
            } else {
                childBox.x1 = Math.round(x);
                childBox.x2 = Math.round(x + placeholderWidth);
            }

            this._dropPlaceholder.allocate(childBox);

            const laters = global.compositor.get_laters();
            laters.add(Meta.LaterType.BEFORE_REDRAW, () => {
                this._dropPlaceholder.show();
            });
            x += placeholderWidth + spacing;
        }

        // We might end up with thumbnailWidth being something like 99.33
        // pixels. To make this work and not end up with a gap at the end,
        // we need some thumbnails to be 99 pixels and some 100 pixels width;
        // we compute an actual scale separately for each thumbnail.
        const x1 = Math.round(x);
        const x2 = Math.round(x + thumbnailWidth);
        const roundedHScale = (x2 - x1) / portholeWidth;

        // Allocating a scaled actor is funny - x1/y1 correspond to the origin
        // of the actor, but x2/y2 are increased by the *unscaled* size.
        if (rtl) {
            childBox.x2 = box.x2 - x1;
            childBox.x1 = box.x2 - (x1 + thumbnailWidth);
        } else {
            childBox.x1 = x1;
            childBox.x2 = x1 + thumbnailWidth;
        }
        childBox.y1 = y1;
        childBox.y2 = y1 + thumbnailHeight;

        thumbnail.setScale(roundedHScale, roundedVScale);
        thumbnail.allocate(childBox);

        thumbnailBoxes[i] = [childBox.x1, childBox.x2, childBox.y1, childBox.y2];

        // We round the collapsing portion so that we don't get thumbnails resizing
        // during an animation due to differences in rounded, but leave the uncollapsed
        // portion unrounded so that non-animating we end up with the right total
        if ((i + 1) % columns === 0) {
            y += thumbnailHeight - Math.round(thumbnailHeight * thumbnail.collapse_fraction) +
                spacing - Math.round(spacing * thumbnail.collapse_fraction);
        } else {
            x += thumbnailWidth - Math.round(thumbnailWidth * thumbnail.collapse_fraction);
        }
    }

    const from = this._wsmatrixIndicatorFrom;
    const to = this._wsmatrixIndicatorTo;
    let lowerBox, upperBox, fraction;
    if (from !== to && thumbnailBoxes[from] && thumbnailBoxes[to] &&
        (indicatorValue - from) * (to - from) >= 0 &&
        Math.abs(indicatorValue - from) <= Math.abs(to - from)) {
        lowerBox = thumbnailBoxes[from];
        upperBox = thumbnailBoxes[to];
        fraction = (indicatorValue - from) / (to - from);
    } else {
        // At rest or during a gesture: follow the neighbouring indices.
        lowerBox = thumbnailBoxes[Math.floor(indicatorValue)] ?? thumbnailBoxes[activeIndex];
        upperBox = thumbnailBoxes[Math.ceil(indicatorValue)] ?? lowerBox;
        fraction = indicatorValue % 1;
    }
    const [lX1, lX2, lY1, lY2] = lowerBox;
    const [uX1, uX2, uY1, uY2] = upperBox;
    const indicatorX1 = lX1 + (uX1 - lX1) * fraction;
    const indicatorX2 = lX2 + (uX2 - lX2) * fraction;
    const indicatorY1 = lY1 + (uY1 - lY1) * fraction;
    const indicatorY2 = lY2 + (uY2 - lY2) * fraction;

    childBox.x1 = indicatorX1 - indicatorLeftFullBorder;
    childBox.x2 = indicatorX2 + indicatorRightFullBorder;
    childBox.y1 = indicatorY1 - indicatorTopFullBorder;
    childBox.y2 = indicatorY2 + indicatorBottomFullBorder;
    this._indicator.allocate(childBox);
}

// True when no drag is tracked or the drag y lies in the thumbnail's row.
const withinDragRow = function (index) {
    const thumbnail = this._thumbnails[index];
    const y = this._wsmatrixDragY;
    return y === undefined || !thumbnail || (y > thumbnail.y && y <= thumbnail.y + thumbnail.height);
};

export default class ThumbnailsBox extends Override {
    enable() {
        const subject = GThumbnailsBox.prototype;
        // Same as the shell's, plus the wallpaper on each new thumbnail.
        this._im.overrideMethod(subject, 'addThumbnails', original =>
            function (start, count) {
                original.call(this, start, count);
                this._thumbnails.slice(start, start + count).forEach(addBackground);
            });

        // The shell picks the drop target by x only, so in a grid every row matched the
        // first row's thumbnail and windows could not be dropped below it (#274).
        this._im.overrideMethod(subject, 'handleDragOver', original =>
            function (source, actor, x, y, time) {
                this._wsmatrixDragY = y;
                return original.call(this, source, actor, x, y, time);
            });

        this._im.overrideMethod(subject, '_withinWorkspace', original =>
            function (x, index, rtl) {
                return withinDragRow.call(this, index) && original.call(this, x, index, rtl);
            });

        // Same for the gaps where a drop creates a new workspace.
        this._im.overrideMethod(subject, '_getPlaceholderTarget', original =>
            function (index, spacing, rtl) {
                return withinDragRow.call(this, index)
                    ? original.call(this, index, spacing, rtl)
                    : [Infinity, Infinity];
            });

        // The shell picks the clicked thumbnail by x only, so a click on a lower row
        // opened the first row's workspace (#259).
        this._im.overrideMethod(subject, '_activateThumbnailAtPoint', () =>
            function (x, y, time) {
                const thumbnail = this._thumbnails.find(t =>
                    x >= t.x && x <= t.x + t.width && y >= t.y && y <= t.y + t.height);
                thumbnail?.activate(time);
            });

        // The overview caps the strip at one thumbnail's height; allow the whole grid.
        this._maxScaleDescriptor = Object.getOwnPropertyDescriptor(subject, 'maxThumbnailScale');
        const {get} = this._maxScaleDescriptor;
        Object.defineProperty(subject, 'maxThumbnailScale', {
            configurable: true,
            get() {
                const rows = global.workspace_manager.layout_rows;
                const rowSpacing = this._porthole
                    ? (rows - 1) * this.get_theme_node().get_length('spacing') / this._porthole.height : 0;
                return get.call(this) * rows + rowSpacing;
            },
        });

        this._im.overrideMethod(subject, 'vfunc_get_preferred_height', (original) => {
            return function () {
                return vfunc_get_preferred_height.call(this, ...arguments);
            };
        });

        this._im.overrideMethod(subject, 'vfunc_get_preferred_width', (original) => {
            return function () {
                return vfunc_get_preferred_width.call(this, ...arguments);
            };
        });

        this._im.overrideMethod(subject, 'vfunc_allocate', (original) => {
            return function () {
                return vfunc_allocate.call(this, ...arguments);
            };
        });
    }

    disable() {
        if (this._maxScaleDescriptor) {
            Object.defineProperty(GThumbnailsBox.prototype, 'maxThumbnailScale', this._maxScaleDescriptor);
            this._maxScaleDescriptor = null;
        }
        super.disable();
    }
}
