import { app, BrowserWindow, dialog, ipcMain, IpcMainInvokeEvent, shell } from 'electron';
import fs from 'fs';
import path from 'path';
import { readZipTextEntries } from './epubZip';
import { createReadAlongSync, isValidBookId } from './readAlongSync';
import { storeManager } from './store';
import { ServerManager } from './server';
import { TrayManager } from './tray';
import { WindowManager } from './window';
import { SsoManager } from './sso';
import { ApiConfig } from '../types';
import { i18n } from '../i18n';

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
  }

  // The folder downloaded audiobooks go to, picked by the user once (asked on
  // the first download) and changeable in Settings. The server reads
  // DOWNLOAD_PATH on every download, so a change applies right away.
  private setupDownloadFolderHandlers(): void {
    const KEY = 'settings.downloadFolder';
    const stored = (): string | null => {
      const folder = storeManager.get<string>(KEY);
      return folder && fs.existsSync(folder) ? folder : null;
    };
    const choose = async (event: IpcMainInvokeEvent): Promise<string | null> => {
      const options: Electron.OpenDialogOptions = {
        title: i18n.t('download.chooseFolderTitle'),
        message: i18n.t('download.chooseFolderMessage'),
        buttonLabel: i18n.t('download.chooseFolderButton'),
        properties: ['openDirectory', 'createDirectory'],
        defaultPath: stored() ?? path.join(app.getPath('music'), 'Storytel'),
      };
      const parent = BrowserWindow.fromWebContents(event.sender);
      const result = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options);
      if (result.canceled || result.filePaths.length === 0) return null;
      const folder = result.filePaths[0];
      storeManager.set(KEY, folder);
      process.env.DOWNLOAD_PATH = folder;
      return folder;
    };

    ipcMain.handle('downloads:get-folder', () => stored());
    ipcMain.handle('downloads:choose-folder', (event: IpcMainInvokeEvent) => choose(event));
    // Before a download: the stored folder, or ask for one (null when cancelled).
    ipcMain.handle('downloads:ensure-folder', (event: IpcMainInvokeEvent) => stored() ?? choose(event));
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
    const STORE_KEY = 'readAlong.epubPaths';
    const getPaths = (): Record<string, string> =>
      storeManager.get<Record<string, string>>(STORE_KEY) || {};
    const storePath = (bookId: unknown, filePath: unknown): { name: string } => {
      if (typeof bookId !== 'string' || !bookId) throw new Error('Invalid book id');
      if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) {
        throw new Error('Invalid EPUB path');
      }
      if (path.extname(filePath).toLowerCase() !== '.epub') {
        throw new Error('Not an EPUB file');
      }
      // Write only the paths map, so other `readAlong.*` settings are kept.
      storeManager.set(STORE_KEY, { ...getPaths(), [bookId]: filePath });
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
      storeManager.set(STORE_KEY, paths);
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
      downloadsDirs: () => [
        ...new Set([process.env.DOWNLOAD_PATH, process.env.LEGACY_DOWNLOAD_PATH].filter((dir): dir is string => !!dir)),
      ],
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
    // The last state the main window reported, so a new pop-out starts in place.
    let lastPlayback: unknown = null;

    // Read-along text size (px), shared by the reading view and the pop-out:
    // stored, then sent to every window so both follow a change made in either.
    ipcMain.handle('readAlong:set-text-size', (_event: IpcMainInvokeEvent, size: unknown) => {
      if (typeof size !== 'number' || !Number.isFinite(size) || size < 8 || size > 40) throw new Error('Invalid text size');
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

    ipcMain.on('readAlong:playback', (event, playback: unknown) => {
      if (event.sender !== mainContents()) return;
      lastPlayback = playback;
      this.windowManager.getReadAlongPopout()?.webContents.send('readAlong:playback', playback);
    });
    ipcMain.handle('readAlong:playback-get', () => lastPlayback);

    const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
    ipcMain.on('readAlong:popout-control', (event, control: { type?: unknown; timeSec?: unknown; seconds?: unknown; rate?: unknown }) => {
      if (event.sender !== this.windowManager.getReadAlongPopout()?.webContents) return;
      const valid =
        control?.type === 'toggle' ||
        (control?.type === 'setSpeed' && isNumber(control.rate) && control.rate > 0 && control.rate <= 4) ||
        (control?.type === 'seek' && isNumber(control.timeSec) && control.timeSec >= 0) ||
        (control?.type === 'skip' && isNumber(control.seconds));
      if (valid) mainContents()?.send('readAlong:popout-control', control);
    });
  }
}
