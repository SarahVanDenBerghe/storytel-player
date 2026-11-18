import {BrowserWindow, Menu, Rectangle, WebContents, app, screen} from 'electron';
import {spawn, ChildProcess} from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import {WindowConfig} from '../types';
import {storeManager} from './store';

// Read along pop-out and its minimized bubble: both snap to a bottom corner of
// the screen when dropped near it, and stay where they are when dropped further away.
const SNAP_MARGIN = 12; // gap to the screen edges once snapped
const SNAP_DISTANCE = 90; // how close (px) the window's corner must come to snap
// Both windows are transparent and draw their own border and soft shadow inside
// a transparent edge of this width, so the shadow fades out instead of being cut
// off. Margins, snapping and corners all apply to the visible box inside it.
// POPOUT_INSET must match the padding in ReadingPopout.tsx.
const POPOUT_INSET = 32;
const POPOUT_MIN = {width: 280, height: 200}; // visible size
const BUBBLE_CIRCLE = 40;
const BUBBLE_INSET = 24;

// Electron's window calls take whole numbers only, and reject -0 (from rounding
// a small negative), so every coordinate goes through this.
const toInt = (value: number): number => Math.round(value) || 0;

/**
 * Snap: when a window's bottom-left corner is near the screen's bottom-left
 * (or bottom-right near bottom-right), the bounds that put it in that corner;
 * otherwise null. `inset` is the window's transparent edge (see POPOUT_INSET).
 */
const snapBounds = (bounds: Rectangle, inset: number): Rectangle | null => {
    const area = screen.getDisplayMatching(bounds).workArea;
    const targetY = area.y + area.height - SNAP_MARGIN;
    const bottom = bounds.y + bounds.height - inset;
    const left = {from: bounds.x + inset, to: area.x + SNAP_MARGIN};
    const right = {from: bounds.x + bounds.width - inset, to: area.x + area.width - SNAP_MARGIN};
    const near = (c: {from: number; to: number}) => Math.hypot(c.from - c.to, bottom - targetY) <= SNAP_DISTANCE;
    const y = toInt(targetY - bounds.height + inset);
    if (near(left)) return {...bounds, x: toInt(left.to - inset), y};
    if (near(right)) return {...bounds, x: toInt(right.to - bounds.width + inset), y};
    return null;
};

/** The visible box of a window with a transparent edge `inset` wide, and back. */
const shrink = (b: Rectangle, inset: number): Rectangle =>
    ({x: b.x + inset, y: b.y + inset, width: b.width - 2 * inset, height: b.height - 2 * inset});
const grow = (b: Rectangle, inset: number): Rectangle => shrink(b, -inset);

/**
 * Moves and sizes a window, letting its transparent edge go past the screen
 * edge. macOS pulls a window back on screen when its frame is set in one go
 * (setBounds, or x/y at creation), but not on a plain move.
 */
const place = (win: BrowserWindow, b: Rectangle): void => {
    const [w, h] = win.getSize();
    if (w !== toInt(b.width) || h !== toInt(b.height)) win.setSize(toInt(b.width), toInt(b.height));
    win.setPosition(toInt(b.x), toInt(b.y));
};

type Side = 'left' | 'right';
/** The side of the screen the box's centre is on. */
const sideOf = (box: Rectangle, area: Rectangle): Side => (box.x + box.width / 2 > area.x + area.width / 2 ? 'right' : 'left');
/** Keeps a box of this size inside the work area. */
const clampInto = (box: Rectangle, area: Rectangle): Rectangle => ({
    ...box,
    x: toInt(Math.min(Math.max(box.x, area.x), area.x + area.width - box.width)),
    y: toInt(Math.min(Math.max(box.y, area.y), area.y + area.height - box.height)),
});

export class WindowManager {
    private mainWindow: BrowserWindow | null = null;
    private readAlongPopout: BrowserWindow | null = null;
    private readAlongBubble: BrowserWindow | null = null;
    // Where a dragged pop-out or bubble was when the drag started, by window id.
    private dragOrigins = new Map<number, [number, number]>();
    // The pop-out's bounds when a resize started.
    private resizeOrigin: Rectangle | null = null;
    private clientProcess: ChildProcess | null = null;
    private isDev: boolean;
    private isDebug: boolean;

    constructor(isDev: boolean, isDebug: boolean) {
        this.isDev = isDev;
        this.isDebug = isDebug;
    }

    create(): BrowserWindow {
        // Get alwaysOnTop setting from store (default: false)
        const alwaysOnTop = storeManager.get<boolean>('settings.alwaysOnTop') ?? false;

        // Restore window bounds if previously saved
        const savedBounds = storeManager.get<{ x?: number; y?: number; width: number; height: number }>('window.bounds');

        const windowConfig: WindowConfig = {
            width: savedBounds?.width && savedBounds.width >= 880 ? savedBounds.width : 1280,
            height: savedBounds?.height && savedBounds.height >= 600 ? savedBounds.height : 800,
            minWidth: 880,
            minHeight: 600,
            x: savedBounds?.x,
            y: savedBounds?.y,
            resizable: true,
            maximizable: true,
            alwaysOnTop
        };

        this.mainWindow = new BrowserWindow({
            ...windowConfig,
            // macOS: no title bar; the window buttons sit in the app's own top-left
            // corner, level with its back button (the renderer leaves room: .mac-titlebar).
            ...(process.platform === 'darwin'
                ? {titleBarStyle: 'hidden' as const, trafficLightPosition: {x: 18, y: 20}}
                : {}),
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: true,
                devTools: this.isDev || this.isDebug,
                // Dev only: the page comes from the Vite server (http), which may not load
                // file:// URLs such as cleaned covers and downloaded audio. The installed
                // app loads its page from a file, so it keeps web security on.
                webSecurity: !this.isDev,
                partition: 'persist:storytel-app',
                preload: path.join(__dirname, '../preload.js'),
            },
            icon: path.join(__dirname, '../../../assets/icon.png'),
            show: false,
            backgroundColor: '#0A0A0A'
        });

        if (this.isDev) {
            this.startDevelopmentServers();
        } else {
            if (!this.isDebug) {
                Menu.setApplicationMenu(null);
                this.mainWindow.setMenu(null);
            }
            this.startProductionServer();
        }

        this.setupEventHandlers();

        return this.mainWindow;
    }

    private setupEventHandlers(): void {
        if (!this.mainWindow) return;

        this.mainWindow.once('ready-to-show', () => {
            this.mainWindow?.show();
        });

        // Save window bounds on resize/move
        let saveTimeout: NodeJS.Timeout | null = null;
        const saveBounds = () => {
            if (!this.mainWindow || this.mainWindow.isDestroyed() || this.mainWindow.isMinimized() || this.mainWindow.isMaximized()) return;
            if (saveTimeout) clearTimeout(saveTimeout);
            saveTimeout = setTimeout(() => {
                try {
                    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                        const bounds = this.mainWindow.getBounds();
                        storeManager.set('window.bounds', bounds);
                    }
                } catch (e) {
                    // Ignore if window was closed in between
                }
            }, 500);
        };

        this.mainWindow.on('resize', saveBounds);
        this.mainWindow.on('move', saveBounds);

        this.mainWindow.on('close', (event) => {
            // @ts-ignore
            if (!app.isQuitting) {
                event.preventDefault();
                this.mainWindow?.hide();
            }
        });

        // The renderer drops the room it keeps for the window buttons in full screen.
        this.mainWindow.on('enter-full-screen', () => this.mainWindow?.webContents.send('window:fullscreen', true));
        this.mainWindow.on('leave-full-screen', () => this.mainWindow?.webContents.send('window:fullscreen', false));

        this.mainWindow.on('closed', () => {
            this.mainWindow = null;
        });
    }

    private startDevelopmentServers(): void {
        const cwdRelative = path.join(__dirname, '../../../');
        const cwd = fs.realpathSync.native(cwdRelative);

        const clientLogFile = path.join(app.getPath('userData'), 'client.log');
        const outFd = fs.openSync(clientLogFile, 'w');
        const errFd = fs.openSync(clientLogFile, 'a');

        this.clientProcess = spawn('npm', ['run', 'client'], {
            cwd: cwd,
            stdio: ['pipe', outFd, errFd],
            shell: true,
        });

        this.attemptLoadUrl('http://localhost:3000');
    }

    private attemptLoadUrl(url: string, maxAttempts: number = 30, delayMs: number = 1000): void {
        let attempts = 0;

        const tryLoad = () => {
            attempts++;
            this.mainWindow?.loadURL(url).catch(() => {
                if (attempts < maxAttempts) {
                    setTimeout(tryLoad, delayMs);
                } else {
                    console.error(`Failed to load ${url} after ${maxAttempts} attempts`);
                    this.mainWindow?.webContents.send('error', 'Failed to connect to dev server');
                }
            });
        };

        tryLoad();
    }

    private startProductionServer(): void {
        const indexPath = path.join(__dirname, '../../../client/build/index.html');
        this.mainWindow?.loadFile(indexPath);
    }

    getWindow(): BrowserWindow | null {
        return this.mainWindow;
    }

    /**
     * Read along pop-out: a small always-on-top window with only the reading
     * view (client/src/components/ReadingPopout.tsx). It has no parent, so it
     * stays visible when the main window is hidden or minimised. Some Linux
     * window managers (Wayland) ignore always-on-top; that is accepted.
     */
    openReadAlongPopout(bookId: string, onOpenChange: (open: boolean) => void): void {
        if (this.getReadAlongPopout()) {
            this.restoreReadAlongPopout();
            return;
        }
        // The visible size it was last left at ('popoutBounds' is the older record
        // of it, from before the transparent edge).
        const saved = storeManager.get<{ width: number; height: number }>('readAlong.popoutSize')
            ?? storeManager.get<{ width: number; height: number }>('readAlong.popoutBounds');
        const width = Math.max(saved?.width ?? 420, POPOUT_MIN.width);
        const height = Math.max(saved?.height ?? 560, POPOUT_MIN.height);
        // Always opens in the bottom-left snap position of the main screen.
        const area = screen.getPrimaryDisplay().workArea;
        const start = grow({x: area.x + SNAP_MARGIN, y: area.y + area.height - SNAP_MARGIN - height, width, height}, POPOUT_INSET);
        const popout = new BrowserWindow({
            ...start,
            // Resized by the handles ReadingPopout draws on its visible edges (the
            // native resize edge would sit out in the transparent margin).
            resizable: false,
            alwaysOnTop: true,
            fullscreenable: false,
            // No title bar: the pop-out draws its own close button and drag strip on hover,
            // and its own corners, border and shadow (see POPOUT_INSET).
            frame: false,
            transparent: true,
            hasShadow: false,
            // macOS: a panel floats over other apps' full-screen spaces without turning
            // the whole app into a Dock-less accessory (see setVisibleOnAllWorkspaces below).
            ...(process.platform === 'darwin' ? {type: 'panel'} : {}),
            webPreferences: {
                contextIsolation: true,
                devTools: this.isDev || this.isDebug,
                // Dev only: the page comes from the Vite server (http), which may not load
                // file:// URLs such as cleaned covers and downloaded audio. The installed
                // app loads its page from a file, so it keeps web security on.
                webSecurity: !this.isDev,
                partition: 'persist:storytel-app',
                preload: path.join(__dirname, '../preload.js'),
            },
            icon: path.join(__dirname, '../../../assets/icon.png'),
            show: false,
            backgroundColor: '#00000000',
        });
        this.readAlongPopout = popout;
        // 'floating' keeps it above normal windows; visibleOnFullScreen lets it
        // show over another app's full-screen space on macOS. Without
        // skipTransformProcessType, Electron hides the app's Dock icon for good,
        // which breaks the main window's full screen and minimize.
        popout.setAlwaysOnTop(true, 'floating');
        popout.setVisibleOnAllWorkspaces(true, {visibleOnFullScreen: true, skipTransformProcessType: true});
        if (!this.isDev && !this.isDebug) popout.setMenu(null);

        // Showing pulls the window back on screen, so it is placed again right after.
        popout.once('ready-to-show', () => {
            popout.show();
            place(popout, start);
        });
        popout.on('close', () => {
            const {width: w, height: h} = shrink(popout.getBounds(), POPOUT_INSET);
            storeManager.set('readAlong.popoutSize', {width: w, height: h});
        });
        popout.on('closed', () => {
            if (this.readAlongPopout === popout) this.readAlongPopout = null;
            this.closeReadAlongBubble();
            onOpenChange(false);
        });

        const query = {readAlongPopout: bookId};
        if (this.isDev) {
            popout.loadURL(`http://localhost:3000/?${new URLSearchParams(query)}`).catch(console.error);
        } else {
            popout.loadFile(path.join(__dirname, '../../../client/build/index.html'), {query}).catch(console.error);
        }
        onOpenChange(true);
    }

    closeReadAlongPopout(): void {
        if (this.readAlongPopout && !this.readAlongPopout.isDestroyed()) this.readAlongPopout.close();
    }

    getReadAlongPopout(): BrowserWindow | null {
        return this.readAlongPopout && !this.readAlongPopout.isDestroyed() ? this.readAlongPopout : null;
    }

    /**
     * Minimize: the pop-out is hidden (not closed, so it keeps its place in the
     * text) and a small round bubble takes its bottom corner on the side of the
     * screen it is on. Clicking the bubble, or the shortcut, brings the pop-out
     * back with that same corner where the bubble is.
     */
    minimizeReadAlongPopout(): void {
        const popout = this.getReadAlongPopout();
        if (!popout || !popout.isVisible()) return;
        const p = shrink(popout.getBounds(), POPOUT_INSET);
        const area = screen.getDisplayMatching(p).workArea;
        popout.hide();
        if (this.getReadAlongBubble()) return;

        // The circle takes the pop-out's bottom corner, at least the snap margin
        // away from the screen edges.
        const right = sideOf(p, area) === 'right';
        const circle = clampInto({
            x: right ? p.x + p.width - BUBBLE_CIRCLE : p.x,
            y: p.y + p.height - BUBBLE_CIRCLE,
            width: BUBBLE_CIRCLE,
            height: BUBBLE_CIRCLE,
        }, shrink(area, SNAP_MARGIN));
        const placeBox = grow(circle, BUBBLE_INSET);
        const bubble = new BrowserWindow({
            ...placeBox,
            frame: false,
            transparent: true,
            backgroundColor: '#00000000',
            hasShadow: false,
            resizable: false,
            minimizable: false,
            maximizable: false,
            fullscreenable: false,
            skipTaskbar: true,
            alwaysOnTop: true,
            // macOS: one click works even while another app is in front.
            acceptFirstMouse: true,
            // Same as the pop-out: floats over other apps' full-screen spaces.
            ...(process.platform === 'darwin' ? {type: 'panel'} : {}),
            webPreferences: {
                contextIsolation: true,
                devTools: this.isDev || this.isDebug,
                partition: 'persist:storytel-app',
                preload: path.join(__dirname, '../preload.js'),
            },
            show: false,
        });
        this.readAlongBubble = bubble;
        bubble.setAlwaysOnTop(true, 'floating');
        bubble.setVisibleOnAllWorkspaces(true, {visibleOnFullScreen: true, skipTransformProcessType: true});
        if (!this.isDev && !this.isDebug) bubble.setMenu(null);
        // Inactive: whatever the user is working in keeps the keyboard.
        bubble.once('ready-to-show', () => {
            bubble.showInactive();
            place(bubble, placeBox);
        });
        bubble.on('closed', () => {
            if (this.readAlongBubble === bubble) this.readAlongBubble = null;
        });

        const query = {readAlongBubble: '1'};
        if (this.isDev) {
            bubble.loadURL(`http://localhost:3000/?${new URLSearchParams(query)}`).catch(console.error);
        } else {
            bubble.loadFile(path.join(__dirname, '../../../client/build/index.html'), {query}).catch(console.error);
        }
    }

    restoreReadAlongPopout(): void {
        const popout = this.getReadAlongPopout();
        const bubble = this.getReadAlongBubble();
        if (popout && bubble) {
            // The pop-out comes back with its bottom corner where the bubble is.
            const c = shrink(bubble.getBounds(), BUBBLE_INSET);
            const area = screen.getDisplayMatching(c).workArea;
            const p = shrink(popout.getBounds(), POPOUT_INSET);
            const right = sideOf(c, area) === 'right';
            place(popout, grow(clampInto({
                ...p,
                x: right ? c.x + c.width - p.width : c.x,
                y: c.y + c.height - p.height,
            }, area), POPOUT_INSET));
        }
        this.closeReadAlongBubble();
        // Inactive, like the bubble: the app the user works in keeps the keyboard.
        // Showing pulls the window back on screen, so it is placed again after.
        if (popout) {
            const target = popout.getBounds();
            popout.showInactive();
            place(popout, target);
        }
    }

    /**
     * Drags the pop-out or the bubble (they draw their own drag handling, since
     * a native drag region would swallow the bubble's click). dx/dy are the
     * pointer's travel since the drag started; on release the window snaps.
     */
    dragReadAlongWindow(contents: WebContents, phase: 'start' | 'move' | 'end', dx: number, dy: number): void {
        const win = [this.getReadAlongPopout(), this.getReadAlongBubble()].find((w) => w?.webContents === contents);
        if (!win) return;
        if (phase === 'start') {
            const [x, y] = win.getPosition();
            this.dragOrigins.set(win.id, [x, y]);
            return;
        }
        const origin = this.dragOrigins.get(win.id);
        if (!origin) return;
        if (phase === 'move') {
            win.setPosition(toInt(origin[0] + dx), toInt(origin[1] + dy));
            return;
        }
        this.dragOrigins.delete(win.id);
        this.snapToBottomCorner(win, win === this.getReadAlongBubble() ? BUBBLE_INSET : POPOUT_INSET);
    }

    /**
     * Resizes the pop-out from one of the handles on its visible edges. `edge`
     * names the sides that move (e.g. 'sw'); dx/dy are the pointer's travel
     * since the press. The opposite sides stay put.
     */
    resizeReadAlongPopout(contents: WebContents, phase: 'start' | 'move' | 'end', edge: string, dx: number, dy: number): void {
        const popout = this.getReadAlongPopout();
        if (!popout || popout.webContents !== contents) return;
        if (phase === 'start') {
            this.resizeOrigin = popout.getBounds();
            return;
        }
        const o = this.resizeOrigin;
        if (!o) return;
        if (phase === 'end') {
            this.resizeOrigin = null;
            return;
        }
        const minW = POPOUT_MIN.width + 2 * POPOUT_INSET;
        const minH = POPOUT_MIN.height + 2 * POPOUT_INSET;
        const b = {...o};
        if (edge.includes('e')) b.width = Math.max(minW, o.width + dx);
        if (edge.includes('w')) {
            b.width = Math.max(minW, o.width - dx);
            b.x = o.x + o.width - b.width;
        }
        if (edge.includes('s')) b.height = Math.max(minH, o.height + dy);
        if (edge.includes('n')) {
            b.height = Math.max(minH, o.height - dy);
            b.y = o.y + o.height - b.height;
        }
        place(popout, b);
    }

    private snapToBottomCorner(win: BrowserWindow, inset: number): void {
        const snapped = snapBounds(win.getBounds(), inset);
        if (snapped) place(win, snapped);
    }

    /** The minimize shortcut: hides a shown pop-out, brings back a hidden one. */
    toggleReadAlongPopout(): void {
        const popout = this.getReadAlongPopout();
        if (!popout) return;
        if (popout.isVisible()) this.minimizeReadAlongPopout();
        else this.restoreReadAlongPopout();
    }

    getReadAlongBubble(): BrowserWindow | null {
        return this.readAlongBubble && !this.readAlongBubble.isDestroyed() ? this.readAlongBubble : null;
    }

    private closeReadAlongBubble(): void {
        this.getReadAlongBubble()?.close();
    }

    killClientProcess(): void {
        if (this.clientProcess) {
            this.clientProcess.kill();
        }
    }

    show(): void {
        if (this.mainWindow) {
            if (this.mainWindow.isMinimized()) {
                this.mainWindow.restore();
            }
            this.mainWindow.show();
            // Force window to foreground on Windows/Linux where focus() alone
            // may not bring the window above a maximized window
            const wasAlwaysOnTop = this.mainWindow.isAlwaysOnTop();
            this.mainWindow.setAlwaysOnTop(true);
            if (!wasAlwaysOnTop) {
                this.mainWindow.setAlwaysOnTop(false);
            }
            this.mainWindow.focus();
        }
    }

    hide(): void {
        this.mainWindow?.hide();
    }

    isVisible(): boolean {
        return this.mainWindow?.isVisible() ?? false;
    }

    setAlwaysOnTop(alwaysOnTop: boolean): void {
        if (this.mainWindow) {
            this.mainWindow.setAlwaysOnTop(alwaysOnTop);
            storeManager.set('settings.alwaysOnTop', alwaysOnTop);
        }
    }

    isAlwaysOnTop(): boolean {
        return this.mainWindow?.isAlwaysOnTop() ?? false;
    }
}
