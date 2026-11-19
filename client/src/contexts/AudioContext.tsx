import React, {
  createContext,
  useContext,
  useRef,
  useState,
  useEffect,
  useCallback,
  useMemo,
  ReactNode,
} from 'react';
import api, { trackAction } from '../utils/api';
import storage from '../utils/storage';
import { BookShelfEntity, BookMetaData } from '../interfaces/books';
import { Chapter } from '../interfaces/chapters';
import { BookmarkPositional } from '../interfaces/bookmarks';
import { extractChaptersFromResponse, generateAudioTracks } from '../utils/chapters';
import i18n from '../i18n';
import { usePlaybackRate } from '../hooks/usePlaybackRate';
import { buildCoverUrl } from '../utils/helpers';
import { SKIP_BACKWARD_SECONDS, SKIP_FORWARD_SECONDS } from '../config/player';
import SpeakerPromptModal from '../components/SpeakerPromptModal';

interface LocalPosition {
  position: number;
  updatedAt: string;
}

// Until when (ms timestamp) playing on speaker needs no confirmation.
const SPEAKER_SNOOZE_KEY = 'speaker_prompt_snoozed_until';

const positionStorageKey = (consumableId: string) => `pos:${consumableId}`;

export const readLocalPosition = async (consumableId: string): Promise<LocalPosition | null> => {
  try {
    const raw = await storage.get(positionStorageKey(consumableId));
    if (!raw) return null;
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (typeof parsed?.position === 'number' && typeof parsed?.updatedAt === 'string') {
      return parsed as LocalPosition;
    }
    return null;
  } catch {
    return null;
  }
};

const writeLocalPosition = async (consumableId: string, position: number) => {
  try {
    const payload: LocalPosition = {
      position,
      updatedAt: new Date().toISOString(),
    };
    await storage.set(positionStorageKey(consumableId), JSON.stringify(payload));
  } catch {
    // best-effort cache; ignore failures
  }
};

export interface CurrentChapterInfo {
  number: number;
  title: string;
  start: number;
  end: number;
  durationInSeconds?: number;
}

export interface AudioContextType {
  activeBook: BookShelfEntity | null;
  activeBookId: string | null;
  activeConsumableId: string | null;
  audioSrc: string | null;
  isLoading: boolean;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
  volume: number;
  isMuted: boolean;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  /** The audiobook's chapters, or the EPUB's while the reading view provides them. */
  chapters: Chapter[];
  /** Read along: the EPUB's chapters placed on the audio (null: back to the audiobook's). */
  setBookChapters: (chapters: Chapter[] | null) => void;
  currentChapter: CurrentChapterInfo | null;
  loadBook: (book: BookShelfEntity | null, bookId: string, autoPlay?: boolean) => Promise<void>;
  togglePlayPause: () => void;
  seek: (seekTime: number) => void;
  skipForward: (seconds?: number) => void;
  skipBackward: (seconds?: number) => void;
  setRate: (rate: number) => void;
  cyclePlaybackRate: () => void;
  setVolume: (newVolume: number) => void;
  toggleMute: () => void;
  jumpToChapter: (startTime: number) => void;
  sleepTimerRemaining: number | null;
  sleepTimerMode: number | 'chapter' | null;
  setSleepTimer: (option: number | 'chapter' | null) => void;
  /** The current sound output, for the volume button; null when unknown. */
  audioOutput: AudioOutput | null;
  /** Until when (ms timestamp) playing on speaker asks nothing; 0 when not snoozed. */
  speakerSnoozedUntil: number;
  /** Ask again before playing on speaker; pauses a book playing out loud. */
  clearSpeakerSnooze: () => void;
  error: string | null;
  setError: (err: string | null) => void;
}

const AudioContext = createContext<AudioContextType | undefined>(undefined);

export const PLAYBACK_RATES = [0.75, 1.0, 1.25, 1.5, 1.75, 2.0];

export function AudioProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const positionUpdateIntervalRef = useRef<any>(null);
  const sleepTimerIntervalRef = useRef<any>(null);

  const [activeBook, setActiveBook] = useState<BookShelfEntity | null>(null);
  const [activeBookId, setActiveBookId] = useState<string | null>(null);
  const [activeConsumableId, setActiveConsumableId] = useState<string | null>(null);

  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const { playbackRate, setRate, applyPlaybackRate } = usePlaybackRate(audioRef);
  const [volume, setVolumeState] = useState(1.0);
  const [isMuted, setIsMuted] = useState(false);
  const [previousVolume, setPreviousVolume] = useState(1.0);
  const [audioChapters, setChapters] = useState<Chapter[]>([]);
  const [bookChapters, setBookChapters] = useState<Chapter[] | null>(null);
  // Everything chapter-based (menu, footer title, sleep timer) uses the book's chapters while read along has them.
  const chapters = bookChapters ?? audioChapters;
  const [sleepTimerRemaining, setSleepTimerRemaining] = useState<number | null>(null);
  const [sleepTimerMode, setSleepTimerMode] = useState<number | 'chapter' | null>(null);
  const [error, setError] = useState<string | null>(null);

  // `loadBook` is handed to components that list it in effect dependencies, so
  // it has to keep a stable identity across renders. It therefore reads the live
  // playback state through these mirrors instead of closing over the state.
  const activeBookIdRef = useRef<string | null>(null);
  const activeConsumableIdRef = useRef<string | null>(null);
  const audioSrcRef = useRef<string | null>(null);
  const isPlayingRef = useRef(false);
  // Discards a slow /stream response once a newer book has taken over.
  const loadRequestIdRef = useRef(0);

  // The shown time; whether a stream is on its way (loadBook until onLoadedMetadata); and a
  // move made before any stream was loaded, applied in onLoadedMetadata.
  const shownTimeRef = useRef(0);
  const streamLoadingRef = useRef(false);
  const pendingMoveRef = useRef<{at: number} | {by: number} | null>(null);

  useEffect(() => {
    activeBookIdRef.current = activeBookId;
    activeConsumableIdRef.current = activeConsumableId;
    audioSrcRef.current = audioSrc;
    isPlayingRef.current = isPlaying;
    shownTimeRef.current = currentTime;
  });

  // Before a stream is loaded (right after launch, with the last book restored) the audio
  // element sits at 0, so a move must not be applied to it: that jumped to the start.
  // Such a move is kept and applied once the stream has loaded, after the saved place is
  // chosen (goToPosition): a seek as a time, a skip as an offset from that place, since the
  // newest place may come from another device. While a stream is loading, moves are ignored.
  const isLoaded = () => !!audioRef.current && audioRef.current.readyState >= HTMLMediaElement.HAVE_METADATA;
  const moveTo = useCallback((timeSec: number) => {
    if (!audioRef.current || streamLoadingRef.current) return;
    if (isLoaded()) audioRef.current.currentTime = timeSec;
    else pendingMoveRef.current = {at: timeSec};
    shownTimeRef.current = timeSec;
    setCurrentTime(timeSec);
  }, []);
  const moveBy = useCallback((deltaSec: number, maxSec: number) => {
    if (!audioRef.current || streamLoadingRef.current) return;
    const timeSec = Math.min(Math.max((isLoaded() ? audioRef.current.currentTime : shownTimeRef.current) + deltaSec, 0), maxSec);
    if (isLoaded()) {
      audioRef.current.currentTime = timeSec;
    } else {
      const pending = pendingMoveRef.current;
      pendingMoveRef.current = pending && 'at' in pending ? {at: timeSec} : {by: (pending?.by ?? 0) + deltaSec};
    }
    shownTimeRef.current = timeSec;
    setCurrentTime(timeSec);
  }, []);

  // Position synchronization helper
  const updatePosition = useCallback(async () => {
    if (!audioRef.current || !activeConsumableId) return;

    const position = Math.floor(audioRef.current.currentTime * 1000);
    // Always persist locally first so offline listening is preserved
    await writeLocalPosition(activeConsumableId, position);

    try {
      await api.put(`/bookmark-positional/${activeConsumableId}`, { position });
    } catch (err) {
      console.warn('Failed to sync position to API, kept locally', err);
    }
  }, [activeConsumableId]);

  // Storytel's saved position (set by any device: phone app, web, this app).
  const readRemotePosition = useCallback(async (consumableId: string) => {
    try {
      const response = await api.get<BookmarkPositional[]>(`/bookmark-positional/${consumableId}`);
      const entry = response.data?.find((format) => format.type === 'abook');
      return entry ? { position: entry.position || 0, updatedAt: entry.updatedTime || null } : null;
    } catch (err) {
      console.warn('Failed to fetch remote position, will use local cache', err);
      return null;
    }
  }, []);

  // Read remote/local saved position and jump
  const goToPosition = useCallback(async (consumableId: string) => {
    const remote = await readRemotePosition(consumableId);
    const local = await readLocalPosition(consumableId);
    let chosenPosition = 0;
    if (remote && local) {
      const remoteTime = remote.updatedAt ? Date.parse(remote.updatedAt) : 0;
      const localTime = Date.parse(local.updatedAt);
      chosenPosition = localTime > remoteTime ? local.position : remote.position;
    } else if (remote) {
      chosenPosition = remote.position;
    } else if (local) {
      chosenPosition = local.position;
    }

    if (audioRef.current) {
      audioRef.current.currentTime = Math.floor(chosenPosition / 1000);
      setCurrentTime(audioRef.current.currentTime);
    }
  }, [readRemotePosition]);

  // While the app stays open (window closed to the tray), the book may be listened to on
  // another device. Before playing on, and when the window is shown again, take Storytel's
  // position if it is newer than this app's last save; otherwise playing on here would
  // also send the old position back to Storytel.
  const catchUpWithOtherDevices = useCallback(async () => {
    const cid = activeConsumableIdRef.current;
    if (!cid || !audioRef.current || !audioRef.current.paused) return;
    const [remote, local] = await Promise.all([readRemotePosition(cid), readLocalPosition(cid)]);
    if (!remote?.updatedAt || !audioRef.current.paused || activeConsumableIdRef.current !== cid) return;
    if (local && Date.parse(local.updatedAt) >= Date.parse(remote.updatedAt)) return;
    // Our own last save comes back from Storytel a moment later: same spot, no jump.
    if (Math.abs(remote.position - audioRef.current.currentTime * 1000) < 2000) return;
    audioRef.current.currentTime = Math.floor(remote.position / 1000);
    setCurrentTime(audioRef.current.currentTime);
    await writeLocalPosition(cid, remote.position);
  }, [readRemotePosition]);

  useEffect(() => {
    const onShown = () => {
      if (document.visibilityState === 'visible') catchUpWithOtherDevices();
    };
    window.addEventListener('focus', onShown);
    document.addEventListener('visibilitychange', onShown);
    return () => {
      window.removeEventListener('focus', onShown);
      document.removeEventListener('visibilitychange', onShown);
    };
  }, [catchUpWithOtherDevices]);

  // Load chapters for active book
  const loadChapters = useCallback(async (consumableId: string, knownDurationSeconds?: number) => {
    if (!consumableId) return;
    try {
      const response = await api.get(`/bookmetadata/${consumableId}`);
      const list = extractChaptersFromResponse(response.data);
      if (list.length > 0) {
        setChapters(list);
        return;
      }
    } catch (err) {
      console.warn('Failed to load chapters from /bookmetadata:', err);
    }

    try {
      const details = await api.get(`/book-details/${consumableId}`);
      const list = extractChaptersFromResponse(details.data);
      if (list.length > 0) {
        setChapters(list);
        return;
      }
    } catch (err) {
      console.warn('Failed to load chapters from /book-details:', err);
    }

    // Fallback: If duration is known, generate structured audio tracks ("Ljudspår")
    const durationSec =
      knownDurationSeconds ||
      (audioRef.current?.duration && !isNaN(audioRef.current.duration) ? audioRef.current.duration : 0);
    if (durationSec > 0) {
      setChapters(generateAudioTracks(durationSec));
    } else {
      setChapters([]);
    }
  }, []);

  // Compute current chapter from chapters list and currentTime
  const currentChapter = useMemo<CurrentChapterInfo | null>(() => {
    if (!chapters || chapters.length === 0) return null;

    for (let i = 0; i < chapters.length; i++) {
      const chapter = chapters[i];
      if (currentTime >= chapter.start && currentTime < chapter.end) {
        return {
          number: chapter.number ?? (i + 1),
          title: chapter.title || `Kapitel ${chapter.number ?? (i + 1)}`,
          start: chapter.start,
          end: chapter.end,
          durationInSeconds: chapter.durationInSeconds,
        };
      }
    }

    const last = chapters[chapters.length - 1];
    if (currentTime >= last.start) {
      return {
        number: last.number ?? chapters.length,
        title: last.title || `Kapitel ${last.number ?? chapters.length}`,
        start: last.start,
        end: last.end,
        durationInSeconds: last.durationInSeconds,
      };
    }

    return null;
  }, [chapters, currentTime]);

  const jumpToChapter = useCallback(
    (startTime: number) => {
      if (typeof startTime === 'number' && !isNaN(startTime)) moveTo(startTime);
    },
    [moveTo]
  );

  // Sleep timer implementation
  const setSleepTimer = useCallback((option: number | 'chapter' | null) => {
    if (sleepTimerIntervalRef.current) {
      clearInterval(sleepTimerIntervalRef.current);
      sleepTimerIntervalRef.current = null;
    }
    setSleepTimerMode(option);

    if (option === null) {
      setSleepTimerRemaining(null);
      return;
    }

    if (typeof option === 'number') {
      const totalSeconds = option * 60;
      setSleepTimerRemaining(totalSeconds);

      sleepTimerIntervalRef.current = setInterval(() => {
        setSleepTimerRemaining((prev) => {
          if (prev === null || prev <= 1) {
            clearInterval(sleepTimerIntervalRef.current);
            sleepTimerIntervalRef.current = null;
            if (audioRef.current) {
              audioRef.current.pause();
            }
            setSleepTimerMode(null);
            return null;
          }
          return prev - 1;
        });
      }, 1000);
    } else if (option === 'chapter') {
      setSleepTimerRemaining(null);
    }
  }, []);

  const shouldAutoPlayRef = useRef<boolean>(true);

  // Speaker guard: playing out loud needs a yes, unless snoozed, already
  // confirmed for this output (until it changes or the app restarts), or muted.
  const [audioOutput, setAudioOutput] = useState<AudioOutput | null>(null);
  const [speakerPrompt, setSpeakerPrompt] = useState<{ device: string | null } | null>(null);
  const outputRef = useRef<AudioOutput | null>(null);
  const confirmedOutputRef = useRef<string | null>(null);
  const snoozedUntilRef = useRef(0);
  const [speakerSnoozedUntil, setSpeakerSnoozedUntil] = useState(0);
  // Set right before a play() that passed the guard; onPlay stops any other.
  const playApprovedRef = useRef(false);
  // The pause onPlay makes for an unapproved play, so onPause can ignore it.
  const guardPauseRef = useRef(false);

  const refreshOutput = useCallback(async () => {
    const output = (await window.electronAudio?.getOutput().catch(() => null)) ?? null;
    outputRef.current = output;
    setAudioOutput(output);
    return output;
  }, []);

  const mayPlayOutLoud = (output: AudioOutput | null) => {
    const audio = audioRef.current;
    return output?.kind === 'headphones'
      || Date.now() < snoozedUntilRef.current
      || (output !== null && confirmedOutputRef.current === output.name)
      || (audio !== null && (audio.muted || audio.volume === 0));
  };

  const playApproved = () => {
    const audio = audioRef.current;
    if (!audio) return;
    playApprovedRef.current = true;
    audio.play().catch((err) => {
      playApprovedRef.current = false;
      console.error(err);
    });
  };

  // Every play goes through here; stable, so loadBook can use it.
  const requestPlay = useCallback(async () => {
    const output = await refreshOutput();
    if (mayPlayOutLoud(output)) playApproved();
    else setSpeakerPrompt({ device: output?.name ?? null });
  }, [refreshOutput]);

  const setSnooze = (until: number) => {
    snoozedUntilRef.current = until;
    setSpeakerSnoozedUntil(until);
    storage.set(SPEAKER_SNOOZE_KEY, String(until)).catch(() => {});
  };

  const clearSpeakerSnooze = useCallback(() => {
    setSnooze(0);
    confirmedOutputRef.current = null;
    const audio = audioRef.current;
    if (audio && !audio.paused && outputRef.current?.kind !== 'headphones') audio.pause();
  }, []);

  const confirmSpeaker = (snoozeHours: number | null) => {
    if (snoozeHours) {
      setSnooze(Date.now() + snoozeHours * 3600_000);
    } else {
      confirmedOutputRef.current = outputRef.current?.name ?? null;
    }
    setSpeakerPrompt(null);
    playApproved();
  };

  useEffect(() => {
    storage.get(SPEAKER_SNOOZE_KEY)
      .then((raw) => {
        snoozedUntilRef.current = Number(raw) || 0;
        setSpeakerSnoozedUntil(snoozedUntilRef.current);
      })
      .catch(() => {});
  }, []);

  // A headset connecting or dropping, or any other output switch: pause, so
  // the book never jumps to the speakers (or away from them) unnoticed.
  useEffect(() => {
    const devices = navigator.mediaDevices;
    if (!devices) return;
    refreshOutput();
    const onDeviceChange = async () => {
      const before = outputRef.current;
      const after = await refreshOutput();
      if (before?.name === after?.name && before?.kind === after?.kind) return;
      confirmedOutputRef.current = null;
      if (audioRef.current && !audioRef.current.paused) audioRef.current.pause();
    };
    devices.addEventListener('devicechange', onDeviceChange);
    return () => devices.removeEventListener('devicechange', onDeviceChange);
  }, [refreshOutput]);

  // Main book loader
  const loadBook = useCallback(
    async (book: BookShelfEntity | null, bookId: string, autoPlay: boolean = true) => {
      const isMatchingBook =
        book &&
        (String(book.id) === String(bookId) ||
         String(book.abook?.id) === String(bookId) ||
         String(book.book?.consumableId) === String(bookId));
      const validBook = isMatchingBook ? book : null;
      const consumableId = validBook?.book?.consumableId || bookId;
      shouldAutoPlayRef.current = autoPlay;

      // If this book is already active and stream is loaded, don't restart
      if (activeBookIdRef.current === bookId && audioSrcRef.current) {
        if (validBook) setActiveBook(validBook);
        if (autoPlay && audioRef.current && !isPlayingRef.current) {
          requestPlay();
        }
        return;
      }

      // If switching from a previous book, flush its position bookmark immediately
      const prevCid = activeConsumableIdRef.current;
      // A move kept for the previous book does not apply to this one.
      if (prevCid !== consumableId) pendingMoveRef.current = null;
      streamLoadingRef.current = true;
      if (prevCid && prevCid !== consumableId && audioRef.current) {
        const prevPosition = Math.floor(audioRef.current.currentTime * 1000);
        if (prevPosition > 0) {
          writeLocalPosition(prevCid, prevPosition);
          api.put(`/bookmark-positional/${prevCid}`, { position: prevPosition }).catch((err) => {
            console.warn('Failed to sync previous book bookmark position:', err);
          });
        }
      }

      // Stop and completely tear down the previous audio element stream
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.removeAttribute('src');
        audioRef.current.load();
      }
      if (positionUpdateIntervalRef.current) {
        clearInterval(positionUpdateIntervalRef.current);
        positionUpdateIntervalRef.current = null;
      }

      isPlayingRef.current = false;
      audioSrcRef.current = null;
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      setAudioSrc(null);

      const knownDurationSec = validBook?.abook?.time ? validBook.abook.time / 1000000 : 0;
      loadChapters(consumableId, knownDurationSec);

      const requestId = ++loadRequestIdRef.current;

      try {
        setIsLoading(true);
        setError(null);
        setActiveBook(validBook);
        activeBookIdRef.current = bookId;
        activeConsumableIdRef.current = consumableId;
        setActiveBookId(bookId);
        setActiveConsumableId(consumableId);

        const response = await api.post('/stream', { bookId, consumableId });
        // A newer loadBook call took over while this stream was being resolved
        if (requestId !== loadRequestIdRef.current) return;

        const streamUrl = response.data.streamUrl;
        audioSrcRef.current = streamUrl;
        setAudioSrc(streamUrl);

        if (audioRef.current) {
          audioRef.current.src = streamUrl;
          audioRef.current.load();
        }
      } catch (err: any) {
        if (requestId !== loadRequestIdRef.current) return;
        streamLoadingRef.current = false;
        console.error('Failed to load audio stream:', err);
        setError(err.response?.status === 403
          ? i18n.t('player.accessDenied')
          : err.response?.data?.error || err.message || i18n.t('player.loadError'));
        setIsLoading(false);
      }
    },
    [loadChapters, requestPlay]
  );

  // Restore previous session on launch
  useEffect(() => {
    const restoreSession = async () => {
      try {
        const raw = await storage.get('last_played_session');
        if (!raw) return;
        const saved = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (saved?.bookId && !activeBookIdRef.current) {
          setActiveBook(saved.book || null);
          activeBookIdRef.current = saved.bookId;
          setActiveBookId(saved.bookId);
          const cid = saved.consumableId || saved.bookId;
          activeConsumableIdRef.current = cid;
          setActiveConsumableId(cid);
          const savedDurationSec = saved.book?.abook?.time ? saved.book.abook.time / 1000000 : 0;
          if (savedDurationSec > 0) {
            setDuration(savedDurationSec);
          }
          loadChapters(cid, savedDurationSec);
          if (cid) {
            const local = await readLocalPosition(cid);
            if (local) {
              setCurrentTime(Math.floor(local.position / 1000));
            }
          }
        }
      } catch (err) {
        console.warn('Failed to restore last played session:', err);
      }
    };
    restoreSession();
  }, [loadChapters]);

  const togglePlayPause = useCallback(() => {
    if (!audioRef.current) return;
    if (!audioSrc && activeBookId) {
      loadBook(activeBook, activeBookId, true);
      return;
    }
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      catchUpWithOtherDevices().finally(requestPlay);
    }
  }, [isPlaying, audioSrc, activeBookId, activeBook, loadBook, catchUpWithOtherDevices, requestPlay]);

  const seek = moveTo;

  // The book the app reopens in the player bar at launch: the last one that
  // actually played, not the last book page merely opened.
  useEffect(() => {
    if (!isPlaying || !activeBookId) return;
    storage
      .set('last_played_session', JSON.stringify({ book: activeBook, bookId: activeBookId, consumableId: activeConsumableId }))
      .catch(() => {});
  }, [isPlaying, activeBook, activeBookId, activeConsumableId]);

  // Read along pop-out: report the playback state (the main process keeps the
  // last one for a pop-out that opens later).
  useEffect(() => {
    window.electronEpub?.sendPlayback({
      bookId: activeBookId, bookName: activeBook?.book?.name ?? null, currentTime, duration, isPlaying, playbackRate,
    });
  }, [activeBookId, activeBook, currentTime, duration, isPlaying, playbackRate]);

  const skipForward = useCallback(
    (seconds: number = SKIP_FORWARD_SECONDS) => {
      if (audioRef.current) {
        moveBy(seconds, duration || audioRef.current.duration || Infinity);
        trackAction('skip_forward', { bookId: activeBookId, consumableId: activeConsumableId, seconds });
      }
    },
    [duration, activeBookId, activeConsumableId, moveBy]
  );

  const skipBackward = useCallback(
    (seconds: number = SKIP_BACKWARD_SECONDS) => {
      if (audioRef.current) {
        moveBy(-seconds, Infinity);
        trackAction('skip_backward', { bookId: activeBookId, consumableId: activeConsumableId, seconds });
      }
    },
    [activeBookId, activeConsumableId, moveBy]
  );

  const cyclePlaybackRate = useCallback(() => {
    const currentIndex = PLAYBACK_RATES.indexOf(playbackRate);
    const nextRate = PLAYBACK_RATES[(currentIndex + 1) % PLAYBACK_RATES.length] || 1.0;
    setRate(nextRate);
  }, [playbackRate, setRate]);

  const setVolume = useCallback((newVolume: number) => {
    setVolumeState(newVolume);
    if (audioRef.current) {
      audioRef.current.volume = newVolume;
    }
    if (newVolume > 0) {
      setIsMuted(false);
    }
  }, []);

  const toggleMute = useCallback(() => {
    if (!audioRef.current) return;
    if (isMuted) {
      audioRef.current.volume = previousVolume;
      setVolumeState(previousVolume);
      setIsMuted(false);
    } else {
      setPreviousVolume(volume);
      audioRef.current.volume = 0;
      setVolumeState(0);
      setIsMuted(true);
    }
  }, [isMuted, previousVolume, volume]);

  // Audio element listeners
  const onPlay = () => {
    // Backstop for a play that skipped requestPlay (e.g. an OS control).
    if (!playApprovedRef.current && !mayPlayOutLoud(outputRef.current)) {
      guardPauseRef.current = true;
      audioRef.current?.pause();
      setSpeakerPrompt({ device: outputRef.current?.name ?? null });
      return;
    }
    playApprovedRef.current = false;
    setIsPlaying(true);
    if (positionUpdateIntervalRef.current) clearInterval(positionUpdateIntervalRef.current);
    positionUpdateIntervalRef.current = setInterval(updatePosition, 15000);
    trackAction('play', { bookId: activeBookId, consumableId: activeConsumableId });
    if (window.trayControls?.updatePlayingState) {
      window.trayControls.updatePlayingState(true, activeBook?.book?.name || null);
    }
  };

  const onPause = () => {
    if (guardPauseRef.current) {
      guardPauseRef.current = false;
      return;
    }
    setIsPlaying(false);
    updatePosition();
    if (positionUpdateIntervalRef.current) {
      clearInterval(positionUpdateIntervalRef.current);
      positionUpdateIntervalRef.current = null;
    }
    trackAction('pause', { bookId: activeBookId, consumableId: activeConsumableId });
    if (window.trayControls?.updatePlayingState) {
      window.trayControls.updatePlayingState(false, activeBook?.book?.name || null);
    }
  };

  const onTimeUpdate = () => {
    if (audioRef.current) {
      const cur = audioRef.current.currentTime;
      setCurrentTime(cur);
      if (sleepTimerMode === 'chapter' && currentChapter && cur >= currentChapter.end - 0.5) {
        audioRef.current.pause();
        setSleepTimerMode(null);
      }
    }
  };

  const onLoadedMetadata = async () => {
    const cid = activeConsumableIdRef.current || activeConsumableId;
    if (audioRef.current && cid) {
      const audioDuration = audioRef.current.duration;
      if (audioDuration && !isNaN(audioDuration)) {
        setDuration(audioDuration);
        setChapters((prev) => {
          if (!prev || prev.length === 0) {
            return generateAudioTracks(audioDuration);
          }
          return prev;
        });
      }
      await goToPosition(cid);
      streamLoadingRef.current = false;
      const pending = pendingMoveRef.current;
      pendingMoveRef.current = null;
      if (pending && audioRef.current) {
        const target = 'at' in pending ? pending.at : audioRef.current.currentTime + pending.by;
        audioRef.current.currentTime = Math.min(Math.max(target, 0), audioRef.current.duration || Infinity);
        setCurrentTime(audioRef.current.currentTime);
      }
      setIsLoading(false);
      await applyPlaybackRate();
      if (shouldAutoPlayRef.current && audioRef.current) {
        requestPlay();
      }
    }
  };

  const onEnded = () => {
    setIsPlaying(false);
    updatePosition();
  };

  // Tray play/pause listeners
  useEffect(() => {
    if (window.trayControls?.onPlayPause) {
      window.trayControls.onPlayPause(() => {
        togglePlayPause();
      });
    }
  }, [togglePlayPause]);

  // Hardware media keys (back/forward) and the OS "Now Playing" controls.
  // Without these handlers, Chromium ignores the previous/next track keys.
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;

    const back = () => skipBackward(SKIP_BACKWARD_SECONDS);
    const forward = () => skipForward(SKIP_FORWARD_SECONDS);
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      // Play goes through the speaker guard; without it Chromium plays directly.
      ['play', () => { requestPlay(); }],
      ['pause', () => audioRef.current?.pause()],
      ['previoustrack', back],
      ['seekbackward', back],
      ['nexttrack', forward],
      ['seekforward', forward],
    ];

    handlers.forEach(([action, handler]) => navigator.mediaSession.setActionHandler(action, handler));
    return () => {
      handlers.forEach(([action]) => navigator.mediaSession.setActionHandler(action, null));
    };
  }, [skipBackward, skipForward, requestPlay]);

  // Title, author and cover shown in the OS "Now Playing" widget.
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;

    const book = activeBook?.book;
    const cover = buildCoverUrl(book?.largeCover || book?.largeCoverE);
    navigator.mediaSession.metadata = book
      ? new MediaMetadata({
          title: book.name,
          artist: book.authorsAsString || activeBook?.abook?.narratorAsString || '',
          artwork: cover ? [{ src: cover }] : [],
        })
      : null;
  }, [activeBook]);

  // Cleanup on unmount & save on window close
  useEffect(() => {
    const handleBeforeUnload = () => {
      const consumableId = activeConsumableIdRef.current;
      // Only while playing: a paused position was saved at the pause, with that time. Saving it
      // again on quit would stamp it "now" and make it beat a newer position from another device.
      if (audioRef.current && consumableId && !audioRef.current.paused) {
        const position = Math.floor(audioRef.current.currentTime * 1000);
        if (position > 0) {
          writeLocalPosition(consumableId, position);
        }
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (positionUpdateIntervalRef.current) {
        clearInterval(positionUpdateIntervalRef.current);
      }
      if (sleepTimerIntervalRef.current) {
        clearInterval(sleepTimerIntervalRef.current);
      }
    };
  }, []);

  // Read along pop-out and the network remote: their controls act on this player.
  useEffect(() => window.electronEpub?.onPopoutControl((control) => {
    if (control.type === 'seek') seek(control.timeSec);
    else if (control.type === 'toggle') togglePlayPause();
    else if (control.type === 'setSpeed') setRate(control.rate);
    else if (control.type === 'back') skipBackward(SKIP_BACKWARD_SECONDS);
    else if (control.type === 'forward') skipForward(SKIP_FORWARD_SECONDS);
    else if (control.seconds >= 0) skipForward(control.seconds);
    else skipBackward(-control.seconds);
  }), [seek, togglePlayPause, setRate, skipForward, skipBackward]);

  return (
    <AudioContext.Provider
      value={{
        activeBook,
        activeBookId,
        activeConsumableId,
        audioSrc,
        isLoading,
        isPlaying,
        currentTime,
        duration,
        playbackRate,
        volume,
        isMuted,
        audioRef,
        chapters,
        setBookChapters,
        currentChapter,
        loadBook,
        togglePlayPause,
        seek,
        skipForward,
        skipBackward,
        setRate,
        cyclePlaybackRate,
        setVolume,
        toggleMute,
        jumpToChapter,
        sleepTimerRemaining,
        sleepTimerMode,
        setSleepTimer,
        audioOutput,
        speakerSnoozedUntil,
        clearSpeakerSnooze,
        error,
        setError,
      }}
    >
      {/* Central persistent audio element */}
      <audio
        ref={audioRef}
        onPlay={onPlay}
        onPause={onPause}
        onTimeUpdate={onTimeUpdate}
        onLoadedMetadata={onLoadedMetadata}
        onEnded={onEnded}
        onError={(e) => {
          console.error('Audio error:', e);
          streamLoadingRef.current = false;
          setIsLoading(false);
          setIsPlaying(false);
        }}
      />
      {children}
      <SpeakerPromptModal
        isOpen={speakerPrompt !== null}
        device={speakerPrompt?.device ?? null}
        onPlay={confirmSpeaker}
        onCancel={() => setSpeakerPrompt(null)}
      />
    </AudioContext.Provider>
  );
}

/** The player, or undefined outside an AudioProvider (the read-along pop-out window has none). */
export function useOptionalAudioContext() {
  return useContext(AudioContext);
}

export function useAudioContext() {
  const context = useContext(AudioContext);
  if (!context) {
    throw new Error('useAudioContext must be used within an AudioProvider');
  }
  return context;
}
