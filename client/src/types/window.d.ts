// Global window type extensions for Electron IPC
export {};

declare global {
  /** The current sound output (see setupAudioOutputHandlers in src/modules/ipc.ts). */
  interface AudioOutput {
    name: string;
    kind: 'headphones' | 'speaker';
  }

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

  /** What the main window's player tells the read-along pop-out. */
  interface ReadAlongPlayback {
    bookId: string | null;
    /** The book's title, e.g. "Golden Son (2 of 2) …": places a part within the ebook. */
    bookName?: string | null;
    currentTime: number;
    duration: number;
    isPlaying: boolean;
    playbackRate: number;
  }

  /** What the read-along pop-out asks the main window's player to do. */
  type ReadAlongPopoutControl =
    | { type: 'seek'; timeSec: number }
    | { type: 'toggle' }
    | { type: 'setSpeed'; rate: number }
    /** Negative seconds skip backward. */
    | { type: 'skip'; seconds: number };

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
    electronAudio?: {
      /** The Mac's current sound output; null when unknown. */
      getOutput: () => Promise<AudioOutput | null>;
    };
    electronLogs?: {
      openLogsFolder: () => Promise<void>;
      onOpenLogsModal: (callback: () => void) => void;
    };
    electronWindow?: {
      setAlwaysOnTop: (alwaysOnTop: boolean) => Promise<void>;
      isAlwaysOnTop: () => Promise<boolean>;
      isFullScreen: () => Promise<boolean>;
      /** A cover's main colour as #rrggbb, darkened for white text; null when unknown. */
      coverColor: (url: string) => Promise<string | null>;
      /** Main window entered or left full screen. Returns an unsubscribe function. */
      onFullScreenChange: (callback: (fullScreen: boolean) => void) => () => void;
    };
    /** Folder for downloaded audiobooks (Electron only). */
    electronDownloads?: {
      /** The fixed download folder (~/Music/<app name>). */
      getFolder: () => Promise<string | null>;
      /** Opens the picked folder in Finder. */
      showFolder: () => Promise<void>;
      /** The fixed download folder, created if needed (never asks). */
      ensureFolder: () => Promise<string | null>;
    };
    /** Read along: the EPUB stored per audiobook (Electron only). */
    electronCovers?: {
      /** ISBN -> file URL of a cleaned cover, ISBN.tidy -> the tidied original (see src/modules/coverColor.ts). */
      overrides: Record<string, string>;
    };
    electronEpub?: {
      /** Opens a file dialog; resolves with null when cancelled. */
      choose: (bookId: string) => Promise<{ name: string } | null>;
      /** Stores a dropped file's path; rejects when it is not an .epub. */
      setPath: (bookId: string, path: string) => Promise<{ name: string }>;
      /** Gives other books (the other parts of a multi-part book) the same stored EPUB. */
      link: (fromBookId: string, toBookIds: string[]) => Promise<void>;
      /** File name of the stored EPUB, or null when none is stored or the file is gone. */
      name: (bookId: string) => Promise<string | null>;
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
      /** Stores the read-along text size and sends it to every window. */
      setTextSize: (size: number) => Promise<void>;
      /** Returns an unsubscribe function. */
      onTextSizeChange: (callback: (size: number) => void) => () => void;
      /** Opens the always-on-top pop-out reading window, or focuses it when open. */
      openPopout: (bookId: string) => Promise<void>;
      closePopout: () => Promise<void>;
      isPopoutOpen: () => Promise<boolean>;
      /** Pop-out: hide it and show the small bubble in the screen corner. */
      minimizePopout: () => void;
      /** Bubble: bring the pop-out back. */
      restorePopout: () => void;
      /** Pop-out or bubble: move its own window; dx/dy are the pointer's travel since 'start'. */
      dragWindow: (phase: 'start' | 'move' | 'end', dx: number, dy: number) => void;
      /** Pop-out: resize from a visible edge; `edge` names the moving sides ('n', 'se', ...). */
      resizeWindow: (phase: 'start' | 'move' | 'end', edge: string, dx: number, dy: number) => void;
      /** Main window: the pop-out opened or closed. Returns an unsubscribe function. */
      onPopoutOpenChange: (callback: (open: boolean) => void) => () => void;
      /** Main window: report the playback state; main relays it to the pop-out. */
      sendPlayback: (playback: ReadAlongPlayback) => void;
      /** Pop-out: the last reported state, or null before any. */
      getPlayback: () => Promise<ReadAlongPlayback | null>;
      onPlayback: (callback: (playback: ReadAlongPlayback) => void) => () => void;
      /** Pop-out: control the main window's player. */
      popoutControl: (control: ReadAlongPopoutControl) => void;
      /** Main window: a control sent by the pop-out. */
      onPopoutControl: (callback: (control: ReadAlongPopoutControl) => void) => () => void;
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
