import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useNavigate, useParams} from 'react-router-dom';
import {useTranslation} from 'react-i18next';
import Navbar from './Navbar';
import {useAudioContext} from '../contexts/AudioContext';
import {EpubParagraph, estimateParagraph, parseEpub} from '../utils/epub';
import {BookIndex, buildBookIndex, matchTranscript, SyncAnchor, timeAtParagraph, wordPositionAt} from '../utils/readAlongSync';
import storage from '../utils/storage';

// Persisted reading text size (px), stored as a number.
const TEXT_SIZE_KEY = 'readAlong.textSize';
const DEFAULT_TEXT_SIZE = 17;
const MIN_TEXT_SIZE = 14;
const MAX_TEXT_SIZE = 22;
// The "Aa" button steps through these sizes and wraps around.
const TEXT_SIZE_STEPS = [14, 16, 17, 18, 20, 22];
const SERIF_STACK = "Charter, 'Iowan Old Style', Georgia, serif";
// Keys that scroll a focused scroller: pressing one means the user took over.
const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ']);
// Follow mode keeps the spoken word on this line, as a fraction of the scroller's height from its top.
const READING_LINE = 0.4;
// Between two reports of the audio time, predict at most this far ahead (audio seconds).
const MAX_PREDICTION_SEC = 1;
// The follow dot's left edge sits this far left of the text column (6 px dot, centred 27 px out).
const DOT_OFFSET = 30;

const focusRing = 'focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF5100]';
const iconBtn = `w-11 h-11 flex flex-shrink-0 items-center justify-center rounded-[10px] text-[#9CA3AF] hover:text-white hover:bg-white/[0.06] transition-colors ${focusRing}`;
const primaryBtn = `min-h-[40px] px-[18px] rounded-[10px] bg-[#FF5100] text-[#0A0A0A] text-[14px] font-semibold hover:bg-[#FF6A26] transition-colors ${focusRing}`;

type LoadStatus = 'loading' | 'empty' | 'error' | 'ready';
type ParagraphPosition = 'before' | 'current' | 'after';

// Where the narration is: a paragraph and how far through its words (0–1).
interface ReadingPlace {
    paragraphIndex: number;
    fraction: number;
    /** The position comes from a nearby sync anchor. */
    synced: boolean;
}

function readingPlace(
    index: BookIndex,
    anchors: SyncAnchor[],
    lengths: number[],
    timeSec: number,
    duration: number,
): ReadingPlace | null {
    const bookFraction = Number.isFinite(timeSec / duration) ? timeSec / duration : 0;
    if (index.words.length === 0) {
        // No word the sync can use (e.g. a script outside a-z): estimate by characters, at the paragraph start.
        const paragraphIndex = estimateParagraph(bookFraction, lengths);
        return paragraphIndex < 0 ? null : {paragraphIndex, fraction: 0, synced: false};
    }
    const lastWord = index.words.length - 1;
    const position = wordPositionAt(index, anchors, timeSec);
    // Without anchors, assume the narration advances evenly through the words.
    const word = position ? position.wordIndex : Math.min(Math.max(bookFraction * index.words.length, 0), lastWord);
    const paragraphIndex = index.paragraphOfWord[Math.floor(word)];
    const start = index.firstWordOfParagraph[paragraphIndex];
    const end = index.firstWordOfParagraph[paragraphIndex + 1] ?? index.words.length;
    return {paragraphIndex, fraction: (word - start) / (end - start), synced: !!position?.synced};
}

// What the main process has told us about the Whisper sync of one book.
interface SyncData {
    bookId: string;
    progress: ReadAlongSyncProgress | null;
    segments: ReadAlongSegment[] | null;
    manualAnchors: ReadAlongManualAnchor[];
}
const NO_MANUAL_ANCHORS: ReadAlongManualAnchor[] = [];

const OpenBookIcon = ({size, strokeWidth}: {size: number; strokeWidth: number}) => (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 5h7a3 3 0 013 3v12a2 2 0 00-2-2H2zM22 5h-7a3 3 0 00-3 3v12a2 2 0 012-2h8z"/>
    </svg>
);

// Memoised so a playback tick only re-renders the paragraphs whose position changed.
// Read paragraphs are dimmed; the current one and later ones look the same.
const Paragraph = React.memo(function Paragraph({index, text, heading, position, title}: {
    index: number;
    text: string;
    heading: boolean;
    position: ParagraphPosition;
    title?: string;
}) {
    const Tag = heading ? 'h2' : 'p';
    const headingStyle = heading ? `text-[1.15em] font-semibold ${index > 0 ? 'mt-[1em]' : ''}` : '';
    return (
        <Tag
            data-index={index}
            title={title}
            aria-current={position === 'current' ? 'true' : undefined}
            className={`mb-[0.6em] ${headingStyle} ${position === 'before' ? 'text-[#8B929C]' : 'text-[#E5E7EB]'}`}
        >
            {text}
        </Tag>
    );
});

function ReadingView() {
    const {t} = useTranslation();
    const {bookId} = useParams();
    const navigate = useNavigate();
    const audio = useAudioContext();
    const epubApi = window.electronEpub;

    // Parsed paragraphs per book, kept for as long as the view is mounted.
    const [booksText, setBooksText] = useState<Record<string, EpubParagraph[]>>({});
    const [status, setStatus] = useState<LoadStatus>('loading');
    const [textSize, setTextSize] = useState(DEFAULT_TEXT_SIZE);
    const [following, setFollowing] = useState(true);
    const [sync, setSync] = useState<SyncData | null>(null);
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
    const [dotLeft, setDotLeft] = useState<number | null>(null);

    const paragraphs = bookId ? booksText[bookId] : undefined;
    const view: LoadStatus = status === 'ready' && !paragraphs ? 'loading' : status;

    const load = useCallback(async (id: string) => {
        const request = ++requestRef.current;
        setStatus('loading');
        setFollowing(true);
        try {
            const result = window.electronEpub ? await window.electronEpub.load(id) : null;
            if (request !== requestRef.current) return;
            if (!result) {
                setStatus('empty');
                return;
            }
            const parsed = parseEpub(result.entries).paragraphs;
            if (parsed.length === 0) throw new Error('EPUB contains no readable text');
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
        storage.get(TEXT_SIZE_KEY)
            .then((value: unknown) => {
                const size = Number(value);
                if (Number.isFinite(size) && size > 0) {
                    setTextSize(Math.min(Math.max(Math.round(size), MIN_TEXT_SIZE), MAX_TEXT_SIZE));
                }
            })
            .catch(() => undefined);
    }, []);

    const cycleTextSize = () => {
        const next = TEXT_SIZE_STEPS.find((size) => size > textSize) ?? TEXT_SIZE_STEPS[0];
        setTextSize(next);
        storage.set(TEXT_SIZE_KEY, next).catch(() => undefined);
    };

    const chooseEpub = async () => {
        if (!bookId || !epubApi) return;
        try {
            const chosen = await epubApi.choose(bookId);
            if (chosen) await load(bookId);
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
        const update = (change: (prev: SyncData) => SyncData) => setSync((prev) => change(
            prev?.bookId === bookId ? prev : {bookId, progress: null, segments: null, manualAnchors: NO_MANUAL_ANCHORS},
        ));
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
                    }));
                })
                .catch((err) => console.error('Read along: cannot read the sync data', err));
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
        api.syncStart(bookId, currentTimeRef.current)
            .then(onProgress)
            .catch((err) => console.error('Read along: cannot start the sync', err));
        return () => {
            alive = false;
            unsubscribe();
        };
    }, [bookId, syncActive]);

    const syncData = sync?.bookId === bookId ? sync : null;
    const bookIndex = useMemo(() => (paragraphs ? buildBookIndex(paragraphs) : null), [paragraphs]);
    const segments = syncData?.segments ?? null;
    // Recomputed only when a chunk arrives (new segments). Manual anchors are no
    // longer used: a click now moves the audio to the text, not the other way round.
    const anchors = useMemo(
        () => (bookIndex && segments ? matchTranscript(bookIndex, segments) : []),
        [bookIndex, segments],
    );
    const placeAt = (timeSec: number) => (showPosition && bookIndex
        ? readingPlace(bookIndex, anchors, lengths, timeSec, audio.duration)
        : null);
    placeAtRef.current = placeAt;
    const place = placeAt(audio.currentTime);
    const currentIndex = place ? place.paragraphIndex : -1;
    const isSynced = !!place?.synced;

    const syncProgress = syncData?.progress ?? null;
    const chip: 'synced' | 'finding' | 'estimated' = isSynced
        ? 'synced'
        : syncProgress?.state === 'running' ? 'finding' : 'estimated';
    let chipDetail: string | undefined;
    if (chip === 'finding' && syncProgress && syncProgress.chunksTotal > 0) {
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

    // Paused (or reduced motion): position once, again after a seek, a new
    // paragraph (reduced motion), new anchors or another text size.
    const staticKey = reducedMotion ? currentIndex : audio.currentTime;
    useEffect(() => {
        if (!following || animate || !showPosition) return;
        scrollToPlace(currentTimeRef.current);
    }, [following, animate, showPosition, staticKey, anchors, textSize, scrollToPlace]);

    // A resize reflows the text: keep the place, and keep the follow dot just
    // left of the text column (inside the scroller's padding on narrow windows).
    useEffect(() => {
        const scroller = scrollerRef.current;
        const article = articleRef.current;
        if (view !== 'ready' || !scroller || !article) return;
        const observer = new ResizeObserver(() => {
            setDotLeft(Math.max(article.offsetLeft - DOT_OFFSET, 0));
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
                    {...scrollerHandlers}
                >
                    <article
                        ref={articleRef}
                        className="max-w-[660px] mx-auto leading-[1.75] select-text"
                        style={{fontSize: textSize, fontFamily: SERIF_STACK}}
                        onClick={handleArticleClick}
                    >
                        {paragraphs.map((p, i) => (
                            <Paragraph
                                key={i}
                                index={i}
                                text={p.text}
                                heading={p.heading}
                                position={currentIndex < 0 || i > currentIndex ? 'after' : i === currentIndex ? 'current' : 'before'}
                                title={setPlaceTitle}
                            />
                        ))}
                    </article>
                </div>
                {following && currentIndex >= 0 && dotLeft !== null && (
                <span
                    aria-hidden="true"
                    className="pointer-events-none absolute w-1.5 h-1.5 -translate-y-1/2 rounded-full bg-[#FF5100]"
                    style={{top: `${READING_LINE * 100}%`, left: dotLeft}}
                />
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
            <Navbar
                barTitle={t('readAlong.open')}
                onBackClick={() => navigate(`/player/${bookId}`)}
                className="max-[1100px]:static max-[1100px]:flex-shrink-0"
            >
                {view === 'ready' && (
                    <>
                        {currentIndex >= 0 && (
                            <span
                                title={chipDetail}
                                className={`inline-flex items-center gap-1.5 h-7 px-2.5 text-[12px] font-medium whitespace-nowrap ${chip === 'synced' ? 'text-[#FFB38F]' : 'text-[#9CA3AF]'}`}
                            >
                                <span
                                    aria-hidden="true"
                                    className={`w-2 h-2 rounded-full border-2 ${
                                        chip === 'synced'
                                            ? 'bg-[#FF5100] border-[#FF5100]'
                                            : chip === 'finding' ? 'border-dashed border-[#9CA3AF]' : 'border-[#9CA3AF]'
                                    }`}
                                />
                                {chip === 'synced' && <span>{t('readAlong.synced')}</span>}
                                {chip === 'finding' && <span>{t('readAlong.finding')}</span>}
                                {chip === 'estimated' && (
                                    <span><span aria-hidden="true">≈ </span>{t('readAlong.estimated')}</span>
                                )}
                                {chipDetail && <span className="sr-only">{chipDetail}</span>}
                            </span>
                        )}
                        <button
                            type="button"
                            onClick={cycleTextSize}
                            aria-label={t('readAlong.textSize', {size: textSize})}
                            title={t('readAlong.textSize', {size: textSize})}
                            className={`${iconBtn} text-[16px]`}
                            style={{fontFamily: SERIF_STACK}}
                        >
                            Aa
                        </button>
                        <button
                            type="button"
                            onClick={chooseEpub}
                            aria-label={t('readAlong.chooseAnother')}
                            title={t('readAlong.chooseAnother')}
                            className={iconBtn}
                        >
                            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                 strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
                            </svg>
                        </button>
                    </>
                )}
            </Navbar>

            {body}

            {!following && currentIndex >= 0 && (
                <button
                    type="button"
                    onClick={() => setFollowing(true)}
                    className={`absolute left-1/2 -translate-x-1/2 bottom-4 z-20 min-h-[40px] px-[18px] rounded-full bg-[#FF5100] text-[#0A0A0A] text-[13px] font-semibold shadow-[0_8px_24px_rgba(0,0,0,0.5)] hover:bg-[#FF6A26] transition-colors ${focusRing}`}
                >
                    {t('readAlong.backToNow')}
                </button>
            )}
        </div>
    );
}

export default ReadingView;
