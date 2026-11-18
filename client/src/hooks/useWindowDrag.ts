import React, {useRef} from 'react';

/**
 * Drags the read-along pop-out or bubble window by hand (see
 * dragReadAlongWindow in src/modules/window.ts): a press that moves more than
 * a few pixels drags the window and snaps it on release; a press that doesn't
 * move stays a normal click.
 */
export function useWindowDrag() {
    const dragged = useRef(false);

    const onPointerDown = (e: React.PointerEvent<HTMLElement>) => {
        if (e.button !== 0) return;
        const api = window.electronEpub;
        if (!api) return;
        const el = e.currentTarget;
        const startX = e.screenX;
        const startY = e.screenY;
        let dragging = false;
        dragged.current = false;
        el.setPointerCapture(e.pointerId);

        const move = (ev: PointerEvent) => {
            const dx = ev.screenX - startX;
            const dy = ev.screenY - startY;
            if (!dragging) {
                if (Math.hypot(dx, dy) < 4) return;
                dragging = true;
                dragged.current = true;
                api.dragWindow('start', 0, 0);
            }
            api.dragWindow('move', dx, dy);
        };
        const end = () => {
            el.removeEventListener('pointermove', move);
            el.removeEventListener('pointerup', end);
            el.removeEventListener('pointercancel', end);
            if (dragging) api.dragWindow('end', 0, 0);
        };
        el.addEventListener('pointermove', move);
        el.addEventListener('pointerup', end);
        el.addEventListener('pointercancel', end);
    };

    // A drag ends with a click event too: swallow it, so dropping isn't a click.
    const onClickCapture = (e: React.MouseEvent) => {
        if (!dragged.current) return;
        dragged.current = false;
        e.preventDefault();
        e.stopPropagation();
    };

    return {onPointerDown, onClickCapture};
}

/** The pop-out's resize handles: which sides a handle moves. */
export type ResizeEdge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

/**
 * Resizes the pop-out from a handle on its visible edge (see
 * resizeReadAlongPopout in src/modules/window.ts); its window is transparent,
 * so the native resize edge would sit outside what you see.
 */
export function startWindowResize(edge: ResizeEdge, e: React.PointerEvent<HTMLElement>) {
    const api = window.electronEpub;
    if (e.button !== 0 || !api) return;
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget;
    const startX = e.screenX;
    const startY = e.screenY;
    el.setPointerCapture(e.pointerId);
    api.resizeWindow('start', edge, 0, 0);
    const move = (ev: PointerEvent) => api.resizeWindow('move', edge, ev.screenX - startX, ev.screenY - startY);
    const end = () => {
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', end);
        el.removeEventListener('pointercancel', end);
        api.resizeWindow('end', edge, 0, 0);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
}
