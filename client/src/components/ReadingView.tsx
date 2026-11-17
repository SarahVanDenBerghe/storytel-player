import React, {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {useNavigate, useParams} from 'react-router-dom';
import {useTranslation} from 'react-i18next';
import Navbar from './Navbar';
import {AudioContextType, useOptionalAudioContext} from '../contexts/AudioContext';
import {EpubParagraph, parseEpub} from '../utils/epub';
import {cleanBookTitle} from '../utils/helpers';
import {BookIndex, buildBookIndex, matchTranscript, ReadingPlace, readingPlace, SyncAnchor, timeAtParagraph} from '../utils/readAlongSync';
import storage from '../utils/storage';
import {ensureAudioDownloaded, shareEpubWithOtherParts, takeEpubFromOtherParts} from '../utils/readAlongAudio';
import TextSizeMenu from './TextSizeMenu';
import EpubButton from './EpubButton';
import apiClient from '../utils/api';

// Persisted reading text size (px), stored as a number.
export const TEXT_SIZE_KEY = 'readAlong.textSize';
export const DEFAULT_TEXT_SIZE = 17;
const MIN_TEXT_SIZE = 14;
const MAX_TEXT_SIZE = 22;
// The "Aa" button steps through these sizes and wraps around.
export const TEXT_SIZE_STEPS = [14, 16, 17, 18, 20, 22];
const SERIF_STACK = "Charter, 'Iowan Old Style', Georgia, serif";
// Keys that scroll a focused scroller: pressing one means the user took over.
const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ']);
// Follow mode keeps the spoken word on this line, as a fraction of the scroller's height from its top.
const READING_LINE = 0.4;
// Between two reports of the audio time, predict at most this far ahead (audio seconds).
const MAX_PREDICTION_SEC = 1;
// While following, text above the reading line fades out towards the top of the
// scroller; the spoken line and everything below it stay fully visible.
const FOLLOW_FADE = `linear-gradient(to bottom, rgba(0, 0, 0, 0.12), #000 calc(${READING_LINE * 100}% - 2em))`;
// The pop-out window is small: smaller text and line height than the main window's.
const POPOUT_TEXT_SHRINK = 2;

const focusRing = 'focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF5100]';
const iconBtn = `w-9 h-9 flex flex-shrink-0 items-center justify-center rounded-[10px] text-[#9CA3AF] hover:text-white hover:bg-white/[0.06] transition-colors ${focusRing}`;
const primaryBtn = `min-h-[40px] px-[18px] rounded-[10px] bg-[#FF5100] text-white text-[14px] font-semibold hover:bg-[#FF6A26] transition-colors ${focusRing}`;

type LoadStatus = 'loading' | 'empty' | 'error' | 'ready';
// Parsed EPUB text per book for the app's lifetime: switching between listening
// and Read along must not re-read and re-parse the EPUB (a loading flash).
const parsedBooks: Record<string, EpubParagraph[]> = {};
// The reader's text size, known before the view mounts (read at startup), so the
// text is never laid out at the default size first and then jumps.
let knownTextSize: number | null = null;
const clampTextSize = (value: unknown): number | null => {
    const size = Number(value);
    return Number.isFinite(size) && size > 0 ? Math.min(Math.max(Math.round(size), MIN_TEXT_SIZE), MAX_TEXT_SIZE) : null;
};
storage.get(TEXT_SIZE_KEY).then((value: unknown) => {
    knownTextSize = clampTextSize(value) ?? knownTextSize;
}).catch(() => undefined);
/** The part of the player the reading view needs; the pop-out window feeds it over IPC. */
export type ReadingAudio = Pick<AudioContextType, 'activeBookId' | 'currentTime' | 'duration' | 'isPlaying' | 'playbackRate' | 'seek'> & {
    /** Title of the playing book; "(2 of 2)" in it places a part within the whole ebook. */
    activeBookName?: string | null;
};

// What the main process has told us about the Whisper sync of one book.
interface SyncData {
    bookId: string;
    progress: ReadAlongSyncProgress | null;
    segments: ReadAlongSegment[] | null;
    manualAnchors: ReadAlongManualAnchor[];
    /** The saved transcript has been read once (the real position is known). */
    loaded: boolean;
}
const NO_MANUAL_ANCHORS: ReadAlongManualAnchor[] = [];
// Kept for the app's lifetime, so reopening Read along starts at the synced
// place instead of an estimate that jumps once the transcript is read again,
// and does not rebuild the word index or re-match the transcript.
const syncCache: Record<string, SyncData> = {};
const indexCache = new WeakMap<EpubParagraph[], BookIndex>();
const anchorsCache = new WeakMap<ReadAlongSegment[], {index: BookIndex; anchors: SyncAnchor[]}>();
const NO_ANCHORS: SyncAnchor[] = [];

const OpenBookIcon = ({size, strokeWidth}: {size: number; strokeWidth: number}) => (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 5h7a3 3 0 013 3v12a2 2 0 00-2-2H2zM22 5h-7a3 3 0 00-3 3v12a2 2 0 012-2h8z"/>
    </svg>
);

// Memoised so a playback tick only re-renders the paragraphs whose state changed.
// All paragraphs share one colour; read text fades through the scroller's mask (FOLLOW_FADE).
const Paragraph = React.memo(function Paragraph({index, text, heading, current, title}: {
    index: number;
    text: string;
    heading: boolean;
    current: boolean;
    title?: string;
}) {
    const Tag = heading ? 'h2' : 'p';
    const headingStyle = heading ? `text-[1.15em] font-semibold ${index > 0 ? 'mt-[1em]' : ''}` : '';
    return (
        <Tag
            data-index={index}
            title={title}
            aria-current={current ? 'true' : undefined}
            className={`mb-[0.6em] text-[#E5E7EB] ${headingStyle}`}
        >
            {text}
        </Tag>
    );
});

/** `popoutAudio` is set in the pop-out reading window, which has no player of its own. */
function ReadingView({popoutAudio}: {popoutAudio?: ReadingAudio}) {
    const {t} = useTranslation();
    const {bookId} = useParams();
    const navigate = useNavigate();
    const sharedAudio = useOptionalAudioContext();
    const audio = popoutAudio ?? sharedAudio;
    if (!audio) throw new Error('ReadingView needs an AudioProvider or popoutAudio');
    const isPopout = !!popoutAudio;
    const bookPart = cleanBookTitle((isPopout ? popoutAudio?.activeBookName : sharedAudio?.activeBook?.book?.name) ?? '').part;
    // Main window: the player, for downloading the audio when the sync needs it.
    const playerRef = useRef(sharedAudio);
    playerRef.current = sharedAudio;
    // Downloading the audio for the sync (percent), and the books already tried.
    const [preparingPercent, setPreparingPercent] = useState<number | null>(null);
    const preparedRef = useRef(new Set<string>());
    const epubApi = window.electronEpub;
    // Main window only: whether the pop-out reading window is open.
    const [popoutOpen, setPopoutOpen] = useState(false);

    useEffect(() => {
        const api = window.electronEpub;
        if (isPopout || !api) return;
        let alive = true;
        api.isPopoutOpen().then((open) => alive && setPopoutOpen(open)).catch(() => undefined);
        const unsubscribe = api.onPopoutOpenChange(setPopoutOpen);
        return () => {
            alive = false;
            unsubscribe();
        };
    }, [isPopout]);

    const togglePopout = () => {
        if (!bookId || !epubApi) return;
        const request = popoutOpen ? epubApi.closePopout() : epubApi.openPopout(bookId);
        request.catch((err) => console.error('Read along: cannot open or close the pop-out', err));
    };

    // Parsed paragraphs per book; starts from the app-wide cache (parsedBooks).
    const [booksText, setBooksText] = useState<Record<string, EpubParagraph[]>>(() => ({...parsedBooks}));
    const [status, setStatus] = useState<LoadStatus>(() => (bookId && parsedBooks[bookId] ? 'ready' : 'loading'));
    const [textSize, setTextSize] = useState(() => knownTextSize ?? DEFAULT_TEXT_SIZE);
    const [following, setFollowing] = useState(true);
    const [sync, setSync] = useState<SyncData | null>(() => (bookId ? syncCache[bookId] ?? null : null));
    const requestRef = useRef(0);
    const currentTimeRef = useRef(0);
    const scrollerRef = useRef<HTMLDivElement>(null);
    const articleRef = useRef<HTMLElement>(null);
    const pointerOnScrollerRef = useRef(false);
    // Set to false synchronously on user input, so the scroll loop stops before React re-renders.
    const followingRef = useRef(true);
    // scrollTop as read back after our own last write: a scroll event at this value is ours.
    const lastScrollTopRef = useRef<number | null>(null);
    // The last reported audio time, when it was reported and the rate then: the base for prediction.
    const reportRef = useRef({time: 0, at: 0, rate: 1});
    const placeAtRef = useRef<(timeSec: number) => ReadingPlace | null>(() => null);
    const [reducedMotion, setReducedMotion] = useState(false);

    const paragraphs = bookId ? booksText[bookId] : undefined;
    const view: LoadStatus = status === 'ready' && !paragraphs ? 'loading' : status;

    const load = useCallback(async (id: string) => {
        const request = ++requestRef.current;
        setStatus('loading');
        setFollowing(true);
        try {
            let result = window.electronEpub ? await window.electronEpub.load(id) : null;
            // A part of a split audiobook without an EPUB uses another part's.
            if (!result && window.electronEpub && await takeEpubFromOtherParts(id)) {
                result = await window.electronEpub.load(id);
            }
            if (request !== requestRef.current) return;
            if (!result) {
                setStatus('empty');
                return;
            }
            const parsed = parseEpub(result.entries).paragraphs;
            if (parsed.length === 0) throw new Error('EPUB contains no readable text');
            parsedBooks[id] = parsed;
            setBooksText((prev) => ({...prev, [id]: parsed}));
            setStatus('ready');
        } catch (err) {
            if (request !== requestRef.current) return;
            console.error('Read along: cannot read the EPUB', err);
            setStatus('error');
        }
    }, []);

    useEffect(() => {
        if (!bookId) return;
        if (booksText[bookId]) {
            requestRef.current++;
            setStatus('ready');
            return;
        }
        void load(bookId);
        // Only a change of book triggers a load; the cache is read, not watched.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bookId, load]);

    useEffect(() => {
        const apply = (value: unknown) => {
            const size = clampTextSize(value);
            if (size !== null) {
                knownTextSize = size;
                setTextSize(size);
            }
        };
        storage.get(TEXT_SIZE_KEY).then(apply).catch(() => undefined);
        // A size picked in the other window (pop-out or reading view).
        return window.electronEpub?.onTextSizeChange(apply);
    }, []);

    const changeTextSize = (next: number) => {
        knownTextSize = next;
        setTextSize(next);
        // Electron: stored and sent to the other window (pop-out or reading view).
        (window.electronEpub ? window.electronEpub.setTextSize(next) : storage.set(TEXT_SIZE_KEY, next)).catch(() => undefined);
    };

    const chooseEpub = async () => {
        if (!bookId || !epubApi) return;
        try {
            const chosen = await epubApi.choose(bookId);
            if (!chosen) return;
            await shareEpubWithOtherParts(bookId);
            await load(bookId);
        } catch (err) {
            console.error('Read along: cannot store the EPUB', err);
            setStatus('error');
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        if (!epubApi || !e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    };

    const handleDrop = async (e: React.DragEvent) => {
        if (!epubApi || !bookId) return;
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (!file || !file.name.toLowerCase().endsWith('.epub')) return;
        try {
            await epubApi.setPath(bookId, epubApi.pathForFile(file));
            await shareEpubWithOtherParts(bookId);
            await load(bookId);
        } catch (err) {
            console.error('Read along: cannot store the dropped EPUB', err);
            setStatus('error');
        }
    };

    // Position: only while this book is the one loaded in the player.
    const lengths = useMemo(() => (paragraphs ?? []).map((p) => p.text.length), [paragraphs]);
    const isThisBook = !!bookId && String(audio.activeBookId) === String(bookId) && audio.duration > 0;
    const showPosition = isThisBook && view === 'ready';
    currentTimeRef.current = audio.currentTime;

    // Whisper sync: transcribe from the listening position, refetch the
    // transcript whenever another chunk is done.
    const syncActive = showPosition && !!epubApi;
    useEffect(() => {
        const api = window.electronEpub;
        if (!bookId || !syncActive || !api) return;
        let alive = true;
        let fetchedChunks = -1;
        let requested = 0;
        let applied = 0;
        const update = (change: (prev: SyncData) => SyncData) => setSync((prev) => {
            const next = change(prev?.bookId === bookId
                ? prev
                : syncCache[bookId] ?? {bookId, progress: null, segments: null, manualAnchors: NO_MANUAL_ANCHORS, loaded: false});
            syncCache[bookId] = next;
            return next;
        });
        const fetchSnapshot = () => {
            const request = ++requested;
            api.syncGet(bookId)
                .then((snapshot) => {
                    // Drop replies for a book we left, and replies older than one already applied.
                    if (!alive || request < applied) return;
                    applied = request;
                    fetchedChunks = Math.max(fetchedChunks, snapshot.progress.chunksDone);
                    update((prev) => ({
                        ...prev,
                        progress: prev.progress ?? snapshot.progress,
                        segments: snapshot.transcript?.segments ?? null,
                        manualAnchors: snapshot.manualAnchors,
                        loaded: true,
                    }));
                })
                .catch((err) => {
                    console.error('Read along: cannot read the sync data', err);
                    // Show the text anyway, at the estimated place.
                    if (alive) update((prev) => ({...prev, loaded: true}));
                });
        };
        const onProgress = (progress: ReadAlongSyncProgress) => {
            // Starting another book emits 'idle' for the cancelled one: filter by book.
            if (!alive || progress.bookId !== bookId) return;
            update((prev) => ({...prev, progress}));
            if (progress.chunksDone > fetchedChunks) {
                fetchedChunks = progress.chunksDone;
                fetchSnapshot();
            }
        };
        // Subscribe first so no progress event is missed while starting.
        const unsubscribe = api.onSyncProgress(onProgress);
        fetchSnapshot();
        const start = () => api.syncStart(bookId, currentTimeRef.current).then((progress) => {
            onProgress(progress);
            return progress;
        });
        start()
            .then(async (progress) => {
                // No audio on disk: download it (main window only, once per book), then sync.
                if (progress.state !== 'unavailable' || isPopout || preparedRef.current.has(bookId)) return;
                const status = await apiClient.get(`/download-status/${bookId}`).then((res) => res.data).catch(() => null);
                if (!alive || !status || status.downloaded) return;
                preparedRef.current.add(bookId);
                setPreparingPercent(0);
                const player = playerRef.current;
                const ok = await ensureAudioDownloaded(bookId, player?.activeConsumableId, player?.activeBook ?? null, (percent) => {
                    if (alive) setPreparingPercent(percent);
                }).finally(() => setPreparingPercent(null));
                if (ok && alive) await start();
            })
            .catch((err) => console.error('Read along: cannot start the sync', err));
        return () => {
            alive = false;
            unsubscribe();
        };
    }, [bookId, syncActive, isPopout]);

    const syncData = sync?.bookId === bookId ? sync : null;
    const bookIndex = useMemo(() => {
        if (!paragraphs) return null;
        const cached = indexCache.get(paragraphs) ?? buildBookIndex(paragraphs);
        indexCache.set(paragraphs, cached);
        return cached;
    }, [paragraphs]);
    const segments = syncData?.segments ?? null;
    // Recomputed only when a chunk arrives (new segments). Manual anchors are no
    // longer used: a click now moves the audio to the text, not the other way round.
    const anchors = useMemo(() => {
        if (!bookIndex || !segments) return NO_ANCHORS;
        const cached = anchorsCache.get(segments);
        if (cached && cached.index === bookIndex) return cached.anchors;
        const matched = matchTranscript(bookIndex, segments);
        anchorsCache.set(segments, {index: bookIndex, anchors: matched});
        return matched;
    }, [bookIndex, segments]);
    // Hold the text back (invisible, laid out) until the real place is known, then fade it in.
    const revealed = !syncActive || !!syncData?.loaded;
    const placeAt = (timeSec: number) => (showPosition && bookIndex
        ? readingPlace(bookIndex, anchors, lengths, timeSec, audio.duration, bookPart)
        : null);
    placeAtRef.current = placeAt;
    const place = placeAt(audio.currentTime);
    const currentIndex = place ? place.paragraphIndex : -1;
    const isSynced = !!place?.synced;

    const syncProgress = syncData?.progress ?? null;
    const chip: 'synced' | 'preparing' | 'finding' | 'estimated' = isSynced
        ? 'synced'
        : preparingPercent !== null ? 'preparing'
        : syncProgress?.state === 'running' ? 'finding' : 'estimated';
    // Until the first sync anchors exist, a centred status covers the text.
    const findingPlace = (chip === 'preparing' || chip === 'finding') && anchors.length === 0;
    let chipDetail: string | undefined;
    if (chip === 'preparing') {
        chipDetail = t('readAlong.preparingDetail', {percent: preparingPercent});
    } else if (chip === 'finding' && syncProgress && syncProgress.chunksTotal > 0) {
        chipDetail = t('readAlong.findingDetail', {done: syncProgress.chunksDone, total: syncProgress.chunksTotal});
    } else if (chip === 'estimated') {
        const problem = syncProgress && (syncProgress.state === 'unavailable' || syncProgress.state === 'error');
        chipDetail = problem && syncProgress.message ? syncProgress.message : t('readAlong.estimatedDetail');
    }

    // Play from here: a click on a paragraph (not the end of a text selection)
    // moves the audio to where that paragraph is read, inside the synced range only.
    const canSetPlace = isThisBook && bookIndex !== null && anchors.length >= 2;
    const setPlaceTitle = canSetPlace ? t('readAlong.playFromHere') : undefined;
    const handleArticleClick = (e: React.MouseEvent<HTMLElement>) => {
        if (!canSetPlace || !bookIndex) return;
        // Part of a double or triple click: the user is selecting words.
        if (e.detail > 1) return;
        if ((window.getSelection()?.toString() ?? '') !== '') return;
        const el = (e.target as HTMLElement).closest<HTMLElement>('[data-index]');
        const paragraphIndex = Number(el?.dataset.index);
        if (!el || !Number.isInteger(paragraphIndex)) return;
        const timeSec = timeAtParagraph(bookIndex, anchors, paragraphIndex);
        if (timeSec === null) return;
        audio.seek(timeSec);
        setFollowing(true);
    };

    useEffect(() => {
        const query = window.matchMedia('(prefers-reduced-motion: reduce)');
        const update = () => setReducedMotion(query.matches);
        update();
        query.addEventListener('change', update);
        return () => query.removeEventListener('change', update);
    }, []);

    // Follow mode, teleprompter style: the spoken word stays on the reading line.
    // Every programmatic scroll goes through here.
    const scrollToPlace = useCallback((timeSec: number) => {
        const scroller = scrollerRef.current;
        const place = placeAtRef.current(timeSec);
        const el = place ? articleRef.current?.children[place.paragraphIndex] as HTMLElement | undefined : undefined;
        if (!scroller || !place || !el) return;
        // Interpolate up to the next paragraph's top so the gap between
        // paragraphs is crossed smoothly instead of in a hop.
        const next = el.nextElementSibling as HTMLElement | null;
        const span = next ? next.offsetTop - el.offsetTop : el.offsetHeight;
        const y = el.offsetTop + place.fraction * span;
        const maxTop = scroller.scrollHeight - scroller.clientHeight;
        const top = Math.min(Math.max(y - READING_LINE * scroller.clientHeight, 0), maxTop);
        if (Math.abs(top - scroller.scrollTop) >= 0.5) scroller.scrollTop = top;
        // Read back: the browser may round or clamp what we wrote.
        lastScrollTopRef.current = scroller.scrollTop;
    }, []);

    // Declared before the scroll effects so they see the current values.
    useEffect(() => {
        followingRef.current = following;
    }, [following]);
    useEffect(() => {
        reportRef.current = {time: audio.currentTime, at: performance.now(), rate: audio.playbackRate};
    }, [audio.currentTime, audio.isPlaying, audio.playbackRate]);

    // While playing: move every frame, predicting the audio time between the
    // context's few reports per second.
    const animate = following && audio.isPlaying && showPosition && !reducedMotion;
    useEffect(() => {
        if (!animate) return;
        let frame = 0;
        const tick = () => {
            if (followingRef.current) {
                const {time, at, rate} = reportRef.current;
                const ahead = Math.min(Math.max(((performance.now() - at) / 1000) * rate, 0), MAX_PREDICTION_SEC);
                scrollToPlace(time + ahead);
            }
            frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [animate, scrollToPlace]);

    // Before the first paint, and after a text-size change: put the place on the
    // reading line, so the view never shows the top of the book and then jumps.
    useLayoutEffect(() => {
        if (view !== 'ready' || !followingRef.current) return;
        scrollToPlace(currentTimeRef.current);
    }, [view, textSize, revealed, anchors, scrollToPlace]);

    // Paused (or reduced motion): position once, again after a seek, a new
    // paragraph (reduced motion), new anchors or another text size.
    const staticKey = reducedMotion ? currentIndex : audio.currentTime;
    useEffect(() => {
        if (!following || animate || !showPosition) return;
        scrollToPlace(currentTimeRef.current);
    }, [following, animate, showPosition, staticKey, anchors, textSize, scrollToPlace]);

    // A resize reflows the text: keep the place.
    useEffect(() => {
        const scroller = scrollerRef.current;
        if (view !== 'ready' || !scroller) return;
        const observer = new ResizeObserver(() => {
            if (followingRef.current) scrollToPlace(currentTimeRef.current);
        });
        observer.observe(scroller);
        return () => observer.disconnect();
    }, [view, scrollToPlace]);

    // A scrollbar drag is a scroll that happens while the pointer is held down on
    // the scroller itself; release can happen anywhere.
    useEffect(() => {
        const release = () => {
            pointerOnScrollerRef.current = false;
        };
        window.addEventListener('pointerup', release);
        window.addEventListener('pointercancel', release);
        return () => {
            window.removeEventListener('pointerup', release);
            window.removeEventListener('pointercancel', release);
        };
    }, []);

    // Only user input stops following, never our own programmatic scrolls.
    const stopFollowing = () => {
        followingRef.current = false;
        setFollowing(false);
    };
    const scrollerHandlers = {
        onWheel: stopFollowing,
        onTouchMove: stopFollowing,
        onKeyDown: (e: React.KeyboardEvent) => {
            if (SCROLL_KEYS.has(e.key)) stopFollowing();
        },
        onPointerDown: (e: React.PointerEvent) => {
            if (e.target === e.currentTarget) pointerOnScrollerRef.current = true;
        },
        // A scrollbar drag. Our own writes also fire scroll events while the
        // pointer is down (e.g. pressed on the margin): those land exactly where we put them.
        onScroll: (e: React.UIEvent<HTMLDivElement>) => {
            if (!pointerOnScrollerRef.current) return;
            const ours = lastScrollTopRef.current;
            if (ours === null || Math.abs(e.currentTarget.scrollTop - ours) > 1) stopFollowing();
        },
    };

    let body: React.ReactNode;
    if (view === 'ready' && paragraphs) {
        body = (
            <div className="relative flex-1 min-h-0 flex flex-col">
                <div
                    ref={scrollerRef}
                    tabIndex={0}
                    role="region"
                    aria-label={t('readAlong.bookText')}
                    className="relative flex-1 min-h-0 overflow-auto px-6 pt-5 pb-12 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#FF5100]"
                    style={following && currentIndex >= 0 ? {maskImage: FOLLOW_FADE} : undefined}
                    {...scrollerHandlers}
                >
                    <article
                        ref={articleRef}
                        className={`max-w-[660px] mx-auto select-text transition-opacity duration-200 ease-out ${isPopout ? 'leading-[1.6]' : 'leading-[1.75]'} ${revealed ? 'opacity-100' : 'opacity-0'}`}
                        style={{fontSize: isPopout ? textSize - POPOUT_TEXT_SHRINK : textSize, fontFamily: SERIF_STACK}}
                        onClick={handleArticleClick}
                    >
                        {paragraphs.map((p, i) => (
                            <Paragraph
                                key={i}
                                index={i}
                                text={p.text}
                                heading={p.heading}
                                current={i === currentIndex}
                                title={setPlaceTitle}
                            />
                        ))}
                    </article>
                </div>
                {findingPlace && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#0A0A0A]/70 animate-fade-in pointer-events-none">
                        <div role="status" className="flex flex-col items-center gap-3 text-center">
                            <span aria-hidden="true" className="w-7 h-7 rounded-full border-2 border-white/10 border-t-[#FF5100] animate-spin"/>
                            <span className="text-[14px] font-medium text-[#E5E7EB]">
                                {chip === 'preparing' ? t('readAlong.preparing') : t('readAlong.finding')}
                            </span>
                            {chipDetail && <span className="text-[12px] text-[#9CA3AF] tabular-nums">{chipDetail}</span>}
                        </div>
                    </div>
                )}
            </div>
        );
    } else if (view === 'empty') {
        body = (
            <div className="flex-1 min-h-0 flex items-center justify-center p-6">
                <div className="max-w-[360px] flex flex-col items-center gap-3 text-center">
                    <span className="text-[#FF5100]"><OpenBookIcon size={32} strokeWidth={1.6}/></span>
                    <h1 className="text-[15px] font-semibold">{t('readAlong.emptyTitle')}</h1>
                    <p className="text-[13px] leading-[1.6] text-[#9CA3AF]">{t('readAlong.emptyBody')}</p>
                    <button type="button" onClick={chooseEpub} className={`mt-1 ${primaryBtn}`}>
                        {t('readAlong.chooseEpub')}
                    </button>
                </div>
            </div>
        );
    } else if (view === 'error') {
        body = (
            <div className="flex-1 min-h-0 flex items-center justify-center p-6">
                <div role="alert" className="max-w-[360px] flex flex-col items-center gap-3 text-center">
                    <h1 className="text-[15px] font-semibold">{t('readAlong.errorTitle')}</h1>
                    <button type="button" onClick={chooseEpub} className={`mt-1 ${primaryBtn}`}>
                        {t('readAlong.chooseAnotherShort')}
                    </button>
                </div>
            </div>
        );
    } else {
        body = (
            <div className="flex-1 min-h-0 flex items-center justify-center p-6">
                <div role="status" className="flex flex-col items-center">
                    <div aria-hidden="true" className="animate-spin rounded-full h-8 w-8 border-2 border-white/10 border-t-[#FF5100] mb-4"/>
                    <div className="text-[15px] font-medium text-[#E5E7EB]">{t('common.loading')}</div>
                </div>
            </div>
        );
    }

    return (
        <div
            className="flex-1 min-h-0 flex flex-col relative bg-[#0A0A0A] text-white"
            onDragOver={handleDragOver}
            onDrop={handleDrop}
        >
            {/* The pop-out shows only the text; ReadingPopout adds its own hover controls. */}
            {!isPopout && <Navbar
                barTitle={t('readAlong.open')}
                onBackClick={() => navigate('/')}
                className="max-[1100px]:static max-[1100px]:flex-shrink-0"
            >
                {view === 'ready' && (
                    <>
                        {/* Only when the place is estimated (no sync); preparing and syncing show centred. */}
                        {currentIndex >= 0 && chip === 'estimated' && (
                            <span
                                title={chipDetail}
                                className="inline-flex items-center gap-1.5 h-7 px-2.5 text-[12px] font-medium whitespace-nowrap text-[#9CA3AF]"
                            >
                                <span aria-hidden="true" className="w-2 h-2 rounded-full border-2 border-[#9CA3AF]"/>
                                <span><span aria-hidden="true">≈ </span>{t('readAlong.estimated')}</span>
                                {chipDetail && <span className="sr-only">{chipDetail}</span>}
                            </span>
                        )}
                        <TextSizeMenu
                            value={textSize}
                            sizes={TEXT_SIZE_STEPS}
                            onChange={changeTextSize}
                            buttonClassName={`${iconBtn} text-[16px]`}
                        />
                        {epubApi && (
                            <button
                                type="button"
                                onClick={togglePopout}
                                aria-pressed={popoutOpen}
                                aria-label={t(popoutOpen ? 'readAlong.closePopout' : 'readAlong.openPopout')}
                                title={t(popoutOpen ? 'readAlong.closePopout' : 'readAlong.openPopout')}
                                className={`${iconBtn} ${popoutOpen ? 'text-[#FF5100] hover:text-[#FF6A26]' : ''}`}
                            >
                                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                     strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="3" y="5" width="18" height="14" rx="2"/>
                                    <rect x="12" y="11" width="6" height="5" rx="1"/>
                                </svg>
                            </button>
                        )}
                        {bookId && (
                            <EpubButton
                                bookId={bookId}
                                book={sharedAudio && String(sharedAudio.activeBookId) === String(bookId) ? sharedAudio.activeBook : null}
                                consumableId={sharedAudio?.activeConsumableId}
                                onChanged={() => void load(bookId)}
                            />
                        )}
                    </>
                )}
            </Navbar>}

            {body}

            {!following && currentIndex >= 0 && (
                <button
                    type="button"
                    onClick={() => setFollowing(true)}
                    className={`absolute left-1/2 -translate-x-1/2 ${isPopout ? 'bottom-16' : 'bottom-4'} z-20 h-8 px-3.5 rounded-full bg-[#FF5100] text-white text-[12px] font-semibold shadow-[0_6px_18px_rgba(0,0,0,0.45)] hover:bg-[#FF6A26] transition-colors ${focusRing}`}
                >
                    {t('readAlong.backToNow')}
                </button>
            )}
        </div>
    );
}

export default ReadingView;
