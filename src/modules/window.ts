import {BrowserWindow, Menu, app} from 'electron';
import {spawn, ChildProcess} from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import {WindowConfig} from '../types';
import {storeManager} from './store';

export class WindowManager {
    private mainWindow: BrowserWindow | null = null;
    private readAlongPopout: BrowserWindow | null = null;
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
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: true,
                devTools: this.isDev || this.isDebug,
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
        if (this.readAlongPopout && !this.readAlongPopout.isDestroyed()) {
            this.readAlongPopout.show();
            this.readAlongPopout.focus();
            return;
        }
        const saved = storeManager.get<{ x?: number; y?: number; width: number; height: number }>('readAlong.popoutBounds');
        const popout = new BrowserWindow({
            width: saved?.width ?? 420,
            height: saved?.height ?? 560,
            x: saved?.x,
            y: saved?.y,
            minWidth: 280,
            minHeight: 200,
            alwaysOnTop: true,
            fullscreenable: false,
            webPreferences: {
                contextIsolation: true,
                devTools: this.isDev || this.isDebug,
                partition: 'persist:storytel-app',
                preload: path.join(__dirname, '../preload.js'),
            },
            icon: path.join(__dirname, '../../../assets/icon.png'),
            show: false,
            backgroundColor: '#0A0A0A',
        });
        this.readAlongPopout = popout;
        // 'floating' keeps it above normal windows; visibleOnFullScreen lets it
        // show over another app's full-screen space on macOS.
        popout.setAlwaysOnTop(true, 'floating');
        popout.setVisibleOnAllWorkspaces(true, {visibleOnFullScreen: true});
        if (!this.isDev && !this.isDebug) popout.setMenu(null);

        popout.once('ready-to-show', () => popout.show());
        popout.on('close', () => storeManager.set('readAlong.popoutBounds', popout.getBounds()));
        popout.on('closed', () => {
            if (this.readAlongPopout === popout) this.readAlongPopout = null;
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
