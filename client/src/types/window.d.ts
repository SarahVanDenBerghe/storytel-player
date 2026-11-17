// Global window type extensions for Electron IPC
export {};

declare global {
  /** Mirrors `LanguageState` in the Electron main process (src/i18n/index.ts). */
  interface AppLanguageState {
    /** 'auto', or an explicit language code the user picked. */
    mode: string;
    /** The language actually in use once 'auto' has been resolved. */
    resolved: string;
    /** OS languages, most preferred first (e.g. ['sv-FI', 'en-FI']). */
    systemLanguages: string[];
    /** What 'auto' resolves to right now. */
    systemResolved: string;
    /** OS country code ('FI'), i.e. where the user is - not their language. */
    region: string | null;
  }

  /** Mirrors `SyncProgress` in src/modules/readAlongSync.ts. */
  interface ReadAlongSyncProgress {
    bookId: string;
    state: 'idle' | 'running' | 'done' | 'error' | 'unavailable';
    chunksDone: number;
    chunksTotal: number;
    /** Why the sync is unavailable or failed (English, from the main process). */
    message?: string;
  }

  /** A Whisper segment; times in seconds from the start of the audiobook, sorted by start. */
  interface ReadAlongSegment {
    start: number;
    end: number;
    text: string;
  }

  interface ReadAlongManualAnchor {
    timeSec: number;
    paragraphIndex: number;
  }

  interface Window {
    // TODO: Define proper types for tray control methods based on actual Electron IPC
    trayControls?: {
      updateProgress?: (current: number, total: number) => void;
      updatePlaybackState?: (isPlaying: boolean) => void;
      updatePlayingState?: (isPlaying: boolean, bookTitle: string | null) => void;
      updateAuthState?: (isAuthenticated: boolean) => void;
      updateSpeed?: (speed: number) => void;
      on?: (event: string, callback: (...args: any[]) => void) => void;
      off?: (event: string) => void;
      onPlayPause?: (callback: () => void) => void;
      onSetSpeed?: (callback: (event: any, speed: number) => void) => (() => void);
      onLogout?: (callback: () => void) => void;
    };
    electronLocale?: {
      getLocale: () => Promise<string>;
      getState: () => Promise<AppLanguageState>;
      setLocale: (locale: string) => Promise<AppLanguageState>;
    };
    electronLogs?: {
      openLogsFolder: () => Promise<void>;
      onOpenLogsModal: (callback: () => void) => void;
    };
    electronWindow?: {
      setAlwaysOnTop: (alwaysOnTop: boolean) => Promise<void>;
      isAlwaysOnTop: () => Promise<boolean>;
    };
    /** Read along: the EPUB stored per audiobook (Electron only). */
    electronEpub?: {
      /** Opens a file dialog; resolves with null when cancelled. */
      choose: (bookId: string) => Promise<{ name: string } | null>;
      /** Stores a dropped file's path; rejects when it is not an .epub. */
      setPath: (bookId: string, path: string) => Promise<{ name: string }>;
      /** Text entries of the stored EPUB, or null when none is stored or the file is gone. */
      load: (bookId: string) => Promise<{ name: string; entries: Record<string, string> } | null>;
      pathForFile: (file: File) => string;
      /** Starts or continues the Whisper transcription; same book while running is a no-op. */
      syncStart: (bookId: string, startAtSec: number) => Promise<ReadAlongSyncProgress>;
      /** Progress, the transcript so far (null before any), and manual anchors. */
      syncGet: (bookId: string) => Promise<{
        progress: ReadAlongSyncProgress;
        transcript: { durationSec: number; segments: ReadAlongSegment[] } | null;
        manualAnchors: ReadAlongManualAnchor[];
      }>;
      /** Replaces any manual anchor within 60 s of timeSec; resolves with the full list. */
      setManualAnchor: (bookId: string, timeSec: number, paragraphIndex: number) => Promise<ReadAlongManualAnchor[]>;
      /** Returns an unsubscribe function. */
      onSyncProgress: (callback: (progress: ReadAlongSyncProgress) => void) => () => void;
    };
    electronAuth?: {
      openSsoWindow: (provider?: 'google' | 'apple') => Promise<{
        cancelled: boolean;
        credentials?: {
          storytelSession: string;
          firebaseRefreshToken: string;
          firebaseApiKey: string;
          email: string;
          cid: string;
        };
        error?: string;
      }>;
    };
  }
}
