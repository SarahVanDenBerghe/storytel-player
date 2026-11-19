import { app, BrowserWindow, dialog, globalShortcut, ipcMain, IpcMainInvokeEvent, powerSaveBlocker, shell } from 'electron';
import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { readZipTextEntries } from './epubZip';
import { coverColor, coverOverrides } from './coverColor';
import { createReadAlongSync, isValidBookId } from './readAlongSync';
import { isValidRate } from './remote';
import { storeManager } from './store';
import { ServerManager } from './server';
import { TrayManager } from './tray';
import { WindowManager } from './window';
import { SsoManager } from './sso';
import { ApiConfig } from '../types';
import { i18n } from '../i18n';

// The read-along pop-out's minimize shortcut (see setupReadAlongPopoutHandlers).
const POPOUT_SHORTCUT = 'CommandOrControl+Shift+;';
// The EPUB file chosen per audiobook: { [bookId]: absolute path }.
const EPUB_PATHS_KEY = 'readAlong.epubPaths';

export class IpcManager {
  private serverManager: ServerManager;
  private trayManager: TrayManager;
  private windowManager: WindowManager;
  private ssoManager: SsoManager;

  constructor(
    serverManager: ServerManager,
    trayManager: TrayManager,
    windowManager: WindowManager,
    ssoManager: SsoManager
  ) {
    this.serverManager = serverManager;
    this.trayManager = trayManager;
    this.windowManager = windowManager;
    this.ssoManager = ssoManager;
  }

  setupHandlers(): void {
    this.setupStoreHandlers();
    this.setupApiHandlers();
    this.setupTrayHandlers();
    this.setupLocaleHandlers();
    this.setupWindowHandlers();
    this.setupLogsHandlers();
    this.setupAuthHandlers();
    this.setupEpubHandlers();
    this.setupReadAlongSyncHandlers();
    this.setupReadAlongPopoutHandlers();
    this.setupDownloadFolderHandlers();
    this.setupAudioOutputHandlers();
  }

  // The Mac's current sound output and whether it plays out loud, so the player
  // can ask before playing on speaker. macOS only (system_profiler, ~0.2 s);
  // resolves null when unknown, which the player treats as a speaker.
  private setupAudioOutputHandlers(): void {
    let lastLogged = '';
    ipcMain.handle('audio:output', () => new Promise((resolve) => {
      execFile('system_profiler', ['SPAudioDataType', '-json'], { timeout: 5000 }, (err, stdout) => {
        if (err) return resolve(null);
        try {
          const devices = (JSON.parse(stdout).SPAudioDataType ?? []).flatMap((group: any) => group._items ?? []);
          const device = devices.find((d: any) => d.coreaudio_default_audio_output_device === 'spaudio_yes');
          if (!device?._name) return resolve(null);
          const entry = JSON.stringify(device);
          if (entry !== lastLogged) {
            lastLogged = entry;
            console.log('[audio-output]', entry);
          }
          const transport = String(device.coreaudio_device_transport ?? '');
          // Bluetooth and USB are headsets; the built-in output is headphones only
          // when something is in the jack (named "External Headphones" on Apple
          // silicon, an output source of headphones on older Macs), else the speakers.
          const headphones = /bluetooth|usb/.test(transport)
            || (/builtin/.test(transport) && /headphone/i.test(`${device._name} ${device.coreaudio_output_source ?? ''}`));
          resolve({ name: device._name, kind: headphones ? 'headphones' : 'speaker' });
        } catch {
          resolve(null);
        }
      });
    }));
  }

  // The folder downloaded audiobooks go to: fixed (~/Music/<app name>, set as
  // DOWNLOAD_PATH in main.ts), never picked. Settings shows it.
  private setupDownloadFolderHandlers(): void {
    const folder = (): string => {
      const dir = process.env.DOWNLOAD_PATH || app.getPath('downloads');
      fs.mkdirSync(dir, { recursive: true });
      return dir;
    };
    ipcMain.handle('downloads:get-folder', () => folder());
    ipcMain.handle('downloads:show-folder', async () => {
      await shell.openPath(folder());
    });
    // Before a download: the fixed folder, created if needed. Never asks.
    ipcMain.handle('downloads:ensure-folder', () => folder());
  }

  private setupStoreHandlers(): void {
    ipcMain.handle('store-get', (_event: IpcMainInvokeEvent, key: string) => {
      return storeManager.get(key);
    });

    ipcMain.handle(
      'store-set',
      (_event: IpcMainInvokeEvent, key: string, value: any) => {
        storeManager.set(key, value);
      }
    );

    ipcMain.handle('store-remove', (_event: IpcMainInvokeEvent, key: string) => {
      storeManager.remove(key);
    });
  }

  private setupApiHandlers(): void {
    ipcMain.handle(
      'api:get',
      async (_event: IpcMainInvokeEvent, url: string, config: ApiConfig = {}) => {
        return await this.serverManager.injectRequest(
          'GET',
          url,
          undefined,
          config?.headers
        );
      }
    );

    ipcMain.handle(
      'api:post',
      async (
        _event: IpcMainInvokeEvent,
        url: string,
        data: any = {},
        config: ApiConfig = {}
      ) => {
        return await this.serverManager.injectRequest(
          'POST',
          url,
          data,
          config?.headers
        );
      }
    );

    ipcMain.handle(
      'api:put',
      async (
        _event: IpcMainInvokeEvent,
        url: string,
        data: any = {},
        config: ApiConfig = {}
      ) => {
        return await this.serverManager.injectRequest(
          'PUT',
          url,
          data,
          config?.headers
        );
      }
    );

    ipcMain.handle(
      'api:delete',
      async (_event: IpcMainInvokeEvent, url: string, config: ApiConfig = {}) => {
        return await this.serverManager.injectRequest(
          'DELETE',
          url,
          undefined,
          config?.headers
        );
      }
    );
  }

  private setupTrayHandlers(): void {
    ipcMain.on(
      'update-playing-state',
      (_event, { isPlaying, bookTitle }: { isPlaying: boolean; bookTitle: string }) => {
        this.trayManager.updatePlayingState({ isPlaying, bookTitle });
      }
    );

    ipcMain.on(
      'update-auth-state',
      (_event, { isAuthenticated }: { isAuthenticated: boolean }) => {
        this.trayManager.updatePlayingState({ isAuthenticated });
      }
    );
  }

  private setupLocaleHandlers(): void {
    ipcMain.handle('get-locale', () => {
      return i18n.getLanguage();
    });

    // Everything the renderer needs to render the picker: the stored mode, the
    // language actually in use, and what 'auto' currently resolves to.
    ipcMain.handle('get-locale-state', () => {
      return i18n.getState();
    });

    ipcMain.handle('set-locale', async (_event: IpcMainInvokeEvent, locale: string) => {
      storeManager.set('appLanguage', locale);

      // Update the current language in i18n
      i18n.detectLanguage();

      // Refresh fastify translations (tray menu, native dialogs) before
      // answering, so the renderer never reads a half-applied state.
      const fastifyServer = this.serverManager.getServer();
      if (fastifyServer) {
        try {
          await i18n.initialize(fastifyServer);
        } catch (err) {
          console.error('Failed to reinitialize i18n:', err);
        }
      }

      // Rebuild the tray menu so its labels follow the new language too.
      this.trayManager.updateMenu();

      return i18n.getState();
    });
  }

  private setupLogsHandlers(): void {
    ipcMain.handle('open-logs-folder', () => {
      const logPath = path.join(process.env.USER_DATA_PATH || '', 'app.log');
      shell.showItemInFolder(logPath);
    });
  }

  private setupWindowHandlers(): void {
    ipcMain.handle('window-set-always-on-top', (_event: IpcMainInvokeEvent, alwaysOnTop: boolean) => {
      this.windowManager.setAlwaysOnTop(alwaysOnTop);
    });

    ipcMain.handle('window-is-always-on-top', () => {
      return this.windowManager.isAlwaysOnTop();
    });

    // Read along keeps the display awake while a book plays, as video players do.
    let keepAwakeId: number | null = null;
    ipcMain.handle('window:keep-awake', (_event: IpcMainInvokeEvent, on: unknown) => {
      if (on === true && keepAwakeId === null) {
        keepAwakeId = powerSaveBlocker.start('prevent-display-sleep');
      } else if (on !== true && keepAwakeId !== null) {
        powerSaveBlocker.stop(keepAwakeId);
        keepAwakeId = null;
      }
    });

    // A cover's main colour (Up next tint); see coverColor.ts.
    ipcMain.handle('covers:color', (_event: IpcMainInvokeEvent, url: unknown) => coverColor(url));
    // Read once by the preload, synchronously, so covers render right the first time.
    ipcMain.on('covers:overrides', (event) => { event.returnValue = coverOverrides(); });

    ipcMain.handle('window-is-full-screen', () => this.windowManager.getWindow()?.isFullScreen() ?? false);
  }

  private setupAuthHandlers(): void {
    ipcMain.handle(
      'auth:open-sso-window',
      async (_event: IpcMainInvokeEvent, provider?: 'google' | 'apple') => {
        const parent = this.windowManager.getWindow();
        return this.ssoManager.openSsoWindow(parent, provider);
      }
    );
  }

  // Read along: the EPUB chosen for each audiobook, stored as an absolute path
  // under `readAlong.epubPaths[bookId]`. The file itself stays where it is.
  private setupEpubHandlers(): void {
    const getPaths = (): Record<string, string> =>
      storeManager.get<Record<string, string>>(EPUB_PATHS_KEY) || {};
    const storePath = (bookId: unknown, filePath: unknown): { name: string } => {
      if (typeof bookId !== 'string' || !bookId) throw new Error('Invalid book id');
      if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) {
        throw new Error('Invalid EPUB path');
      }
      if (path.extname(filePath).toLowerCase() !== '.epub') {
        throw new Error('Not an EPUB file');
      }
      // Write only the paths map, so other `readAlong.*` settings are kept.
      storeManager.set(EPUB_PATHS_KEY, { ...getPaths(), [bookId]: filePath });
      return { name: path.basename(filePath) };
    };

    ipcMain.handle('epub:choose', async (event: IpcMainInvokeEvent, bookId: string) => {
      const options: Electron.OpenDialogOptions = {
        properties: ['openFile'],
        filters: [{ name: 'EPUB', extensions: ['epub'] }],
      };
      const parent = BrowserWindow.fromWebContents(event.sender);
      const result = parent
        ? await dialog.showOpenDialog(parent, options)
        : await dialog.showOpenDialog(options);
      if (result.canceled || result.filePaths.length === 0) return null;
      return storePath(bookId, result.filePaths[0]);
    });

    ipcMain.handle(
      'epub:set-path',
      (_event: IpcMainInvokeEvent, bookId: string, filePath: string) => storePath(bookId, filePath)
    );

    // Give other books (the other parts of a multi-part book) the same EPUB.
    ipcMain.handle('epub:link', (_event: IpcMainInvokeEvent, fromBookId: unknown, toBookIds: unknown) => {
      const paths = getPaths();
      const filePath = typeof fromBookId === 'string' ? paths[fromBookId] : undefined;
      if (!filePath || !Array.isArray(toBookIds)) return;
      for (const id of toBookIds) {
        if (typeof id === 'string' && id) paths[id] = filePath;
      }
      storeManager.set(EPUB_PATHS_KEY, paths);
    });

    // File name of the stored EPUB, or null when none is stored or the file is gone.
    ipcMain.handle('epub:name', (_event: IpcMainInvokeEvent, bookId: string) => {
      const filePath = typeof bookId === 'string' ? getPaths()[bookId] : undefined;
      return filePath && fs.existsSync(filePath) ? path.basename(filePath) : null;
    });

    ipcMain.handle('epub:load', async (_event: IpcMainInvokeEvent, bookId: string) => {
      const filePath = typeof bookId === 'string' ? getPaths()[bookId] : undefined;
      if (!filePath || !fs.existsSync(filePath)) return null;
      let buf: Buffer;
      try {
        buf = await fs.promises.readFile(filePath);
      } catch (err) {
        throw new Error(`Cannot read EPUB file: ${(err as Error).message}`);
      }
      return { name: path.basename(filePath), entries: readZipTextEntries(buf) };
    });
  }

  // Read along: Whisper transcription of the downloaded audio, one book at a time.
  private setupReadAlongSyncHandlers(): void {
    const sync = createReadAlongSync({
      userDataDir: app.getPath('userData'),
      downloadsDirs: () => {
        let legacy: string[] = [];
        try {
          legacy = JSON.parse(process.env.LEGACY_DOWNLOAD_PATHS || '[]');
        } catch {
          legacy = [];
        }
        return [...new Set([process.env.DOWNLOAD_PATH, ...legacy].filter((dir): dir is string => typeof dir === 'string' && !!dir))];
      },
      onProgress: (progress) => {
        for (const win of BrowserWindow.getAllWindows()) {
          if (!win.isDestroyed()) win.webContents.send('readAlong:sync-progress', progress);
        }
      },
    });
    // Never leave ffmpeg or whisper-cli running after the app is gone.
    app.on('will-quit', () => sync.cancel());
    process.on('exit', () => sync.cancel());

    const checkBookId = (bookId: unknown): string => {
      if (!isValidBookId(bookId)) throw new Error('Invalid book id');
      return bookId;
    };
    const checkSeconds = (value: unknown): number => {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        throw new Error('Invalid time');
      }
      return value;
    };

    ipcMain.handle(
      'readAlong:sync-start',
      (_event: IpcMainInvokeEvent, bookId: unknown, startAtSec: unknown) =>
        sync.start(checkBookId(bookId), checkSeconds(startAtSec))
    );

    ipcMain.handle('readAlong:sync-get', (_event: IpcMainInvokeEvent, bookId: unknown) =>
      sync.get(checkBookId(bookId))
    );

    ipcMain.handle(
      'readAlong:set-manual-anchor',
      (_event: IpcMainInvokeEvent, bookId: unknown, timeSec: unknown, paragraphIndex: unknown) => {
        if (typeof paragraphIndex !== 'number' || !Number.isInteger(paragraphIndex) || paragraphIndex < 0) {
          throw new Error('Invalid paragraph index');
        }
        return sync.setManualAnchor(checkBookId(bookId), checkSeconds(timeSec), paragraphIndex);
      }
    );
  }

  // Read along pop-out: the main window plays the audio and reports its
  // playback state; the pop-out shows the text and sends player controls back.
  private setupReadAlongPopoutHandlers(): void {
    const mainContents = () => {
      const win = this.windowManager.getWindow();
      return win && !win.isDestroyed() ? win.webContents : null;
    };
    const notifyOpen = (open: boolean) => mainContents()?.send('readAlong:popout-open-change', open);
    const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
    // The last state the main window reported, so a new pop-out starts in place.
    let lastPlayback: unknown = null;

    // Read-along text size (px), shared by the reading view and the pop-out:
    // stored, then sent to every window so both follow a change made in either.
    ipcMain.handle('readAlong:set-text-size', (_event: IpcMainInvokeEvent, size: unknown) => {
      if (typeof size !== 'number' || !Number.isFinite(size) || size < 8 || size > 64) throw new Error('Invalid text size');
      storeManager.set('readAlong.textSize', size);
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) win.webContents.send('readAlong:text-size', size);
      }
    });

    ipcMain.handle('readAlong:popout-open', (_event: IpcMainInvokeEvent, bookId: unknown) => {
      if (!isValidBookId(bookId)) throw new Error('Invalid book id');
      this.windowManager.openReadAlongPopout(bookId, notifyOpen);
    });
    ipcMain.handle('readAlong:popout-close', () => this.windowManager.closeReadAlongPopout());
    ipcMain.handle('readAlong:popout-is-open', () => this.windowManager.getReadAlongPopout() !== null);
    // Minimize to a bubble (sent by the pop-out) and back (sent by the bubble).
    ipcMain.on('readAlong:popout-minimize', (event) => {
      if (event.sender === this.windowManager.getReadAlongPopout()?.webContents) this.windowManager.minimizeReadAlongPopout();
    });
    ipcMain.on('readAlong:popout-restore', (event) => {
      if (event.sender === this.windowManager.getReadAlongBubble()?.webContents) this.windowManager.restoreReadAlongPopout();
    });
    ipcMain.on('readAlong:window-resize', (event, phase: unknown, edge: unknown, dx: unknown, dy: unknown) => {
      if ((phase === 'start' || phase === 'move' || phase === 'end') && typeof edge === 'string'
        && /^(n|s|e|w|ne|nw|se|sw)$/.test(edge) && isNumber(dx) && isNumber(dy)) {
        this.windowManager.resizeReadAlongPopout(event.sender, phase, edge, dx, dy);
      }
    });
    ipcMain.on('readAlong:window-drag', (event, phase: unknown, dx: unknown, dy: unknown) => {
      if ((phase === 'start' || phase === 'move' || phase === 'end') && isNumber(dx) && isNumber(dy)) {
        this.windowManager.dragReadAlongWindow(event.sender, phase, dx, dy);
      }
    });
    // Works from any app. With a pop-out open it hides or shows it; without one it
    // opens the pop-out for the book in the player, when that book has an EPUB.
    // macOS matches the character the key types, so ';' is ⌘⇧; on any keyboard
    // layout (tested on AZERTY).
    const onShortcut = () => {
      if (this.windowManager.getReadAlongPopout()) {
        this.windowManager.toggleReadAlongPopout();
        return;
      }
      const bookId = (lastPlayback as { bookId?: unknown } | null)?.bookId;
      if (!isValidBookId(bookId)) return;
      const epubPath = (storeManager.get<Record<string, string>>(EPUB_PATHS_KEY) || {})[bookId];
      if (epubPath && fs.existsSync(epubPath)) this.windowManager.openReadAlongPopout(bookId, notifyOpen);
    };
    if (!globalShortcut.register(POPOUT_SHORTCUT, onShortcut)) {
      console.warn(`Read along: shortcut ${POPOUT_SHORTCUT} is taken by another app`);
    }
    app.on('will-quit', () => globalShortcut.unregister(POPOUT_SHORTCUT));

    ipcMain.on('readAlong:playback', (event, playback: unknown) => {
      if (event.sender !== mainContents()) return;
      lastPlayback = playback;
      this.windowManager.getReadAlongPopout()?.webContents.send('readAlong:playback', playback);
    });
    ipcMain.handle('readAlong:playback-get', () => lastPlayback);

    ipcMain.on('readAlong:popout-control', (event, control: { type?: unknown; timeSec?: unknown; seconds?: unknown; rate?: unknown }) => {
      if (event.sender !== this.windowManager.getReadAlongPopout()?.webContents) return;
      const valid =
        control?.type === 'toggle' ||
        (control?.type === 'setSpeed' && isValidRate(control.rate)) ||
        (control?.type === 'seek' && isNumber(control.timeSec) && control.timeSec >= 0) ||
        (control?.type === 'skip' && isNumber(control.seconds));
      if (valid) mainContents()?.send('readAlong:popout-control', control);
    });
  }
}
