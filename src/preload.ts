import { contextBridge, ipcRenderer, IpcRendererEvent, webUtils } from 'electron';
import type { LanguageState } from './i18n';
import type { ManualAnchor, SyncProgress, SyncSnapshot } from './modules/readAlongSync';

// Store API
contextBridge.exposeInMainWorld('electronStore', {
  get: (key: string): Promise<any> => ipcRenderer.invoke('store-get', key),
  remove: (key: string): Promise<void> => ipcRenderer.invoke('store-remove', key),
  set: (key: string, value: any): Promise<void> =>
    ipcRenderer.invoke('store-set', key, value),
});

// Locale API
contextBridge.exposeInMainWorld('electronLocale', {
  getLocale: (): Promise<string> => ipcRenderer.invoke('get-locale'),
  // Stored mode ('auto' or a code), the resolved language, and the OS
  // preference list - everything the language picker needs in one round trip.
  getState: (): Promise<LanguageState> => ipcRenderer.invoke('get-locale-state'),
  // Resolves with the new state so the renderer can follow 'auto' immediately.
  setLocale: (locale: string): Promise<LanguageState> =>
    ipcRenderer.invoke('set-locale', locale),
});

// Window API
// Cleaned covers (ISBN -> file URL), fixed for the window's lifetime.
contextBridge.exposeInMainWorld('electronCovers', { overrides: ipcRenderer.sendSync('covers:overrides') });

contextBridge.exposeInMainWorld('electronWindow', {
  setAlwaysOnTop: (alwaysOnTop: boolean): Promise<void> =>
    ipcRenderer.invoke('window-set-always-on-top', alwaysOnTop),
  isAlwaysOnTop: (): Promise<boolean> =>
    ipcRenderer.invoke('window-is-always-on-top'),
  isFullScreen: (): Promise<boolean> => ipcRenderer.invoke('window-is-full-screen'),
  coverColor: (url: string): Promise<string | null> => ipcRenderer.invoke('covers:color', url),
  keepAwake: (on: boolean): Promise<void> => ipcRenderer.invoke('window:keep-awake', on),
  onFullScreenChange: (callback: (fullScreen: boolean) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, fullScreen: boolean) => callback(fullScreen);
    ipcRenderer.on('window:fullscreen', listener);
    return () => { ipcRenderer.removeListener('window:fullscreen', listener); };
  },
});

// Tray Controls API
contextBridge.exposeInMainWorld('trayControls', {
  onPlayPause: (callback: () => void): void => {
    ipcRenderer.on('tray-play-pause', callback);
  },
  onSetSpeed: (callback: (_event: IpcRendererEvent, speed: number) => void): (() => void) => {
    ipcRenderer.on('tray-set-speed', callback);
    return () => { ipcRenderer.removeListener('tray-set-speed', callback); };
  },
  onLogout: (callback: () => void): void => {
    ipcRenderer.on('tray-logout', callback);
  },
  updatePlayingState: (isPlaying: boolean, bookTitle: string): void => {
    ipcRenderer.send('update-playing-state', { isPlaying, bookTitle });
  },
  updateAuthState: (isAuthenticated: boolean): void => {
    ipcRenderer.send('update-auth-state', { isAuthenticated });
  },
});

// Logs API
contextBridge.exposeInMainWorld('electronLogs', {
  openLogsFolder: (): Promise<void> => ipcRenderer.invoke('open-logs-folder'),
  onOpenLogsModal: (callback: () => void): void => {
    ipcRenderer.on('open-logs-modal', callback);
  },
});

// Electron API
interface ApiConfig {
  headers?: Record<string, string>;
}

contextBridge.exposeInMainWorld('electronApi', {
  get: (url: string, _: any, config?: ApiConfig): Promise<any> => ipcRenderer.invoke('api:get', url, config),
  post: (url: string, data: any, config?: ApiConfig): Promise<any> =>
    ipcRenderer.invoke('api:post', url, data, config),
  put: (url: string, data: any, config?: ApiConfig): Promise<any> =>
    ipcRenderer.invoke('api:put', url, data, config),
  delete: (url: string, _: any, config?: ApiConfig): Promise<any> =>
    ipcRenderer.invoke('api:delete', url, config),
});

// Auth / SSO API
interface SsoCredentials {
  storytelSession: string;
  firebaseRefreshToken: string;
  firebaseApiKey: string;
  email: string;
  cid: string;
}
interface SsoLoginResult {
  cancelled: boolean;
  credentials?: SsoCredentials;
  error?: string;
}

type SsoProvider = 'google' | 'apple';

contextBridge.exposeInMainWorld('electronAuth', {
  openSsoWindow: (provider?: SsoProvider): Promise<SsoLoginResult> =>
    ipcRenderer.invoke('auth:open-sso-window', provider),
});

// Download folder API (see setupDownloadFolderHandlers in src/modules/ipc.ts).
contextBridge.exposeInMainWorld('electronDownloads', {
  getFolder: (): Promise<string | null> => ipcRenderer.invoke('downloads:get-folder'),
  showFolder: (): Promise<void> => ipcRenderer.invoke('downloads:show-folder'),
  ensureFolder: (): Promise<string | null> => ipcRenderer.invoke('downloads:ensure-folder'),
});

// Sound output API (see setupAudioOutputHandlers in src/modules/ipc.ts).
contextBridge.exposeInMainWorld('electronAudio', {
  getOutput: (): Promise<{ name: string; kind: 'headphones' | 'speaker' } | null> =>
    ipcRenderer.invoke('audio:output'),
});

// Read along API: the EPUB stored per audiobook, read in the main process.
contextBridge.exposeInMainWorld('electronEpub', {
  choose: (bookId: string): Promise<{ name: string } | null> =>
    ipcRenderer.invoke('epub:choose', bookId),
  setPath: (bookId: string, filePath: string): Promise<{ name: string }> =>
    ipcRenderer.invoke('epub:set-path', bookId, filePath),
  name: (bookId: string): Promise<string | null> => ipcRenderer.invoke('epub:name', bookId),
  link: (fromBookId: string, toBookIds: string[]): Promise<void> =>
    ipcRenderer.invoke('epub:link', fromBookId, toBookIds),
  load: (bookId: string): Promise<{ name: string; entries: Record<string, string> } | null> =>
    ipcRenderer.invoke('epub:load', bookId),
  // Absolute path of a dropped File (File.path no longer exists in Electron).
  pathForFile: (file: File): string => webUtils.getPathForFile(file),
  // Whisper transcription of the downloaded audio (see src/modules/readAlongSync.ts).
  syncStart: (bookId: string, startAtSec: number): Promise<SyncProgress> =>
    ipcRenderer.invoke('readAlong:sync-start', bookId, startAtSec),
  syncGet: (bookId: string): Promise<SyncSnapshot> =>
    ipcRenderer.invoke('readAlong:sync-get', bookId),
  setManualAnchor: (bookId: string, timeSec: number, paragraphIndex: number): Promise<ManualAnchor[]> =>
    ipcRenderer.invoke('readAlong:set-manual-anchor', bookId, timeSec, paragraphIndex),
  onSyncProgress: (callback: (progress: SyncProgress) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, progress: SyncProgress) => callback(progress);
    ipcRenderer.on('readAlong:sync-progress', listener);
    return () => { ipcRenderer.removeListener('readAlong:sync-progress', listener); };
  },
  // Text size shared by the reading view and the pop-out.
  setTextSize: (size: number): Promise<void> => ipcRenderer.invoke('readAlong:set-text-size', size),
  onTextSizeChange: (callback: (size: number) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, size: number) => callback(size);
    ipcRenderer.on('readAlong:text-size', listener);
    return () => { ipcRenderer.removeListener('readAlong:text-size', listener); };
  },
  // Pop-out reading window (see setupReadAlongPopoutHandlers in src/modules/ipc.ts).
  openPopout: (bookId: string): Promise<void> => ipcRenderer.invoke('readAlong:popout-open', bookId),
  closePopout: (): Promise<void> => ipcRenderer.invoke('readAlong:popout-close'),
  isPopoutOpen: (): Promise<boolean> => ipcRenderer.invoke('readAlong:popout-is-open'),
  minimizePopout: (): void => ipcRenderer.send('readAlong:popout-minimize'),
  restorePopout: (): void => ipcRenderer.send('readAlong:popout-restore'),
  dragWindow: (phase: 'start' | 'move' | 'end', dx: number, dy: number): void =>
    ipcRenderer.send('readAlong:window-drag', phase, dx, dy),
  resizeWindow: (phase: 'start' | 'move' | 'end', edge: string, dx: number, dy: number): void =>
    ipcRenderer.send('readAlong:window-resize', phase, edge, dx, dy),
  onPopoutOpenChange: (callback: (open: boolean) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, open: boolean) => callback(open);
    ipcRenderer.on('readAlong:popout-open-change', listener);
    return () => { ipcRenderer.removeListener('readAlong:popout-open-change', listener); };
  },
  // Main window -> pop-out.
  sendPlayback: (playback: unknown): void => ipcRenderer.send('readAlong:playback', playback),
  getPlayback: (): Promise<unknown> => ipcRenderer.invoke('readAlong:playback-get'),
  onPlayback: (callback: (playback: unknown) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, playback: unknown) => callback(playback);
    ipcRenderer.on('readAlong:playback', listener);
    return () => { ipcRenderer.removeListener('readAlong:playback', listener); };
  },
  // Pop-out -> main window: seek, play/pause, skip.
  popoutControl: (control: unknown): void => ipcRenderer.send('readAlong:popout-control', control),
  onPopoutControl: (callback: (control: unknown) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, control: unknown) => callback(control);
    ipcRenderer.on('readAlong:popout-control', listener);
    return () => { ipcRenderer.removeListener('readAlong:popout-control', listener); };
  },
});
