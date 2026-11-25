import React, {useEffect, useRef, useState} from 'react';
import {useLocation, useNavigate, useParams} from 'react-router-dom';
import {useTranslation} from 'react-i18next';
import LoadingState from './LoadingState';
import ErrorState from './ErrorState';
import Navbar from './Navbar';
import ChaptersModal from "./ChaptersModal";
import PlayerControls from "./PlayerControls";
import BookInfo from "./BookInfo";
import DownloadCancelModal from "./DownloadCancelModal";
import {BookShelfEntity} from "../interfaces/books";
import {readLocalPosition, useAudioContext} from "../contexts/AudioContext";
import {useChapters} from "../hooks/useChapters";
import {bookRouteId, isLocalBook, truncateTitle} from '../utils/helpers';
import {SKIP_BACKWARD_SECONDS, SKIP_FORWARD_SECONDS} from '../config/player';
import {upNext, useUpNext} from '../hooks/useUpNext';
import "../types/window.d.ts";
import api, { trackAction } from "../utils/api";

function PlayerView() {
    const {t} = useTranslation();
    const {bookId} = useParams();
    const location = useLocation();
    const starredIds = useUpNext();
    const navigate = useNavigate();
    const audio = useAudioContext();

    const [fetchedBook, setFetchedBook] = useState<BookShelfEntity | null>(null);

    // Reset fetched book details when switching to a different book
    useEffect(() => {
        setFetchedBook(null);
    }, [bookId]);

    // Check if the central active book matches this route's bookId
    const isCurrentActiveBook =
        audio.activeBook &&
        (String(audio.activeBookId) === String(bookId) ||
         String(audio.activeBook.id) === String(bookId) ||
         String(audio.activeBook.book?.consumableId) === String(bookId) ||
         String(audio.activeBook.abook?.id) === String(bookId));

    // Check if navigation state book matches this route's bookId
    const stateBookMatches =
        location.state?.book &&
        (String(location.state.book.id) === String(bookId) ||
         String(location.state.book.book?.consumableId) === String(bookId) ||
         String(location.state.book.abook?.id) === String(bookId));

    // Check if fetched fallback book matches this route's bookId
    const fetchedBookMatches =
        fetchedBook &&
        (String(fetchedBook.id) === String(bookId) ||
         String(fetchedBook.book?.consumableId) === String(bookId) ||
         String(fetchedBook.abook?.id) === String(bookId));

    const book: BookShelfEntity | null =
        (stateBookMatches ? location.state.book : null) ||
        (fetchedBookMatches ? fetchedBook : null) ||
        (isCurrentActiveBook ? audio.activeBook : null);

    // The play buttons navigate here with `autoPlay` in the router state; opening
    // the player any other way (mini player, deep link) only loads the book.
    const autoPlayRequested = location.state?.autoPlay === true;
    const activeConsumableId = book?.book?.consumableId || bookId || '';

    const [error, setError] = useState('');
    const [isLoadingBookData, setIsLoadingBookData] = useState(true);
    const [showKeyOverlay, setShowKeyOverlay] = useState<'play' | 'pause' | 'forward' | 'backward' | null>(null);
    const [isDownloaded, setIsDownloaded] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const [showDownloadCancelModal, setShowDownloadCancelModal] = useState(false);

    // Fetch fallback book details if not available
    useEffect(() => {
        const hasBookDetails = stateBookMatches || isCurrentActiveBook;
        if (!hasBookDetails && bookId && isLocalBook(null, bookId)) {
            // A local book is not on Storytel: its entry comes from the shelf.
            let cancelled = false;
            api.get('/bookshelf')
                .then((res) => {
                    const entry = (res.data?.books || []).find((b: BookShelfEntity) => bookRouteId(b) === bookId);
                    if (!cancelled && entry) setFetchedBook(entry);
                })
                .catch((e) => {
                    if (!cancelled) console.error("Failed to load the local book:", e);
                });
            return () => {
                cancelled = true;
            };
        }
        if (!hasBookDetails && bookId) {
            let cancelled = false;
            api.get(`/book-details/${bookId}`)
                .then((res) => {
                    if (cancelled) return;
                    const data = res.data || {};
                    const formats = data.formats || [];
                    const abook = formats.find((f: any) => f.type === 'abook');
                    const ebook = formats.find((f: any) => f.type === 'ebook');
                    const cover = abook?.cover?.url || ebook?.cover?.url || data.cover?.url || '';
                    const authors = (data.authors || []).map((a: any) => a.name).join(', ');
                    const narrators = (data.narrators || []).map((n: any) => n.name).join(', ');
                    const entity: any = {
                        id: bookId,
                        status: 2,
                        book: {
                            name: data.title || '',
                            authorsAsString: authors,
                            consumableId: String(bookId),
                            largeCover: cover,
                            largeCoverE: '',
                            category: { title: data.category?.name || '' },
                            language: { localizedName: '' }
                        },
                        abook: abook ? {
                            id: abook.id || bookId,
                            narratorAsString: narrators,
                            time: (abook.durationInMilliseconds || 0) * 1000,
                            description: data.description || ''
                        } : null,
                        abookMark: null,
                        ebook: ebook || null
                    };
                    setFetchedBook(entity);
                })
                .catch((e) => {
                    if (!cancelled) {
                        console.error("Failed to fetch fallback book details:", e);
                    }
                });

            return () => {
                cancelled = true;
            };
        }
    }, [bookId, stateBookMatches, isCurrentActiveBook]);

    // Load book into central audio player. The play intent belongs to the
    // navigation, so it is honoured on the first run - which also resumes a book
    // that is loaded but paused - and afterwards only while the stream is still
    // missing. A re-run (the book details arriving, say, or React invoking the
    // effect twice in development) can therefore neither swallow the intent nor
    // resume playback the user has just paused.
    // Only a play request loads the book: merely opening a book's page leaves the
    // player (and the player bar) on the book it holds, and this page shows a preview.
    const lastBookIdRef = useRef<string | null>(null);
    useEffect(() => {
        if (bookId && autoPlayRequested) {
            const isNewBook = lastBookIdRef.current !== bookId;
            lastBookIdRef.current = bookId;
            const isAlreadyLoaded = audio.activeBookId === bookId && !isNewBook && !!audio.audioSrc;
            if (isNewBook || !isAlreadyLoaded) audio.loadBook(book, bookId, true);
        }
    }, [bookId, book, autoPlayRequested, audio.loadBook]);

    // Preview: another book is in the player. Show this book's last position
    // (this computer's, else Storytel's) and length; play switches the player to it.
    const isPreview = !!bookId && String(audio.activeBookId) !== String(bookId);
    const [previewTime, setPreviewTime] = useState(0);
    useEffect(() => {
        if (!isPreview || !book) return;
        let alive = true;
        const cid = book.book?.consumableId || bookId || '';
        readLocalPosition(cid).then((local) => {
            if (alive) setPreviewTime(local ? local.position / 1000 : (book.abookMark?.pos || 0) / 1000000);
        });
        return () => {
            alive = false;
        };
    }, [isPreview, book, bookId]);
    const shownTime = isPreview ? previewTime : audio.currentTime;
    const shownDuration = isPreview ? (book?.abook?.time || 0) / 1000000 : audio.duration;
    const playThisBook = () => {
        if (bookId) audio.loadBook(book, bookId, true);
    };

    // Chapters hook
    const chapters = useChapters({
        consumableId: activeConsumableId,
        currentTime: shownTime,
        onError: setError,
    });

    // Load book data (chapters; bookmarks load in PlayerTools when opened)
    useEffect(() => {
        const loadBookData = async () => {
            if (activeConsumableId) {
                setIsLoadingBookData(true);
                try {
                    await chapters.loadChapters();
                } finally {
                    setIsLoadingBookData(false);
                }
                if (book) {
                    document.title = truncateTitle(book.book.name);
                }
            }
        };

        void loadBookData();

        return () => {
            document.title = 'Storytel Companion';
        };
    }, [activeConsumableId, book]);

    // Check download status on mount
    useEffect(() => {
        const checkDownloadStatus = async () => {
            if (bookId) {
                try {
                    const {data: statusData} = await api.get(`/download-status/${bookId}`);
                    setIsDownloaded(statusData.downloaded);
                } catch (err) {
                    console.error('Failed to check download status', err);
                }
            }
        };

        void checkDownloadStatus();
    }, [bookId]);

    // Handle download button click
    const handleDownloadClick = async () => {
        if (isDownloading || isDownloaded) {
            setShowDownloadCancelModal(true);
        } else {
            await handleDownload();
        }
    };

    // Handle download
    const handleDownload = async () => {
        if (!bookId || isDownloading) return;
        // First download: ask where downloaded audiobooks go (cancel = no download).
        if (window.electronDownloads && !(await window.electronDownloads.ensureFolder())) return;

        setIsDownloading(true);
        try {
            trackAction('User initiated download', { bookId: book?.id, bookName: book?.book?.name || "Unknown" });

            const response = await api.post('/download', {
                bookId,
                consumableId: activeConsumableId,
                book,
            });

            if (response && (response as any).data?.success) {
                setIsDownloaded(true);
            } else {
                if ((response as any)?.data?.error !== 'Download cancelled') {
                    setError((response as any)?.data?.error || t('download.failed'));
                }
            }
        } catch (err: any) {
            if (err?.response?.status === 403) {
                setError(t('player.accessDenied'));
                return;
            }
            const errorMsg = err?.data?.error || err?.response?.data?.error;
            if (errorMsg !== 'Download cancelled' && errorMsg !== 'canceled') {
                setError(errorMsg || err.message || t('download.failed'));
            }
        } finally {
            setIsDownloading(false);
        }
    };

    // Handle cancel download or delete file
    const handleCancelOrDelete = async () => {
        if (!bookId) return;

        try {
            setShowDownloadCancelModal(false);

            if (isDownloading) {
                trackAction('User cancelled download', { bookId });
                await api.delete(`/download/${bookId}`);
                setIsDownloading(false);
            } else if (isDownloaded) {
                trackAction('User deleted downloaded book', { bookId });
                await api.delete(`/downloaded-file/${bookId}`);
                setIsDownloaded(false);
            }
        } catch (err: any) {
            setError(err.response?.data?.error || err.message || t('download.operationFailed'));
            setShowDownloadCancelModal(false);
        }
    };

    // Keyboard shortcuts handler
    useEffect(() => {
        const handleKeyPress = (event: KeyboardEvent) => {
            if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
                return;
            }

            // Preview: Space plays this book; the arrows wait until it is in the player.
            if (isPreview && event.code !== 'Space') return;
            switch (event.code) {
                case 'Space':
                    event.preventDefault();
                    setShowKeyOverlay(audio.isPlaying && !isPreview ? 'pause' : 'play');
                    if (isPreview) playThisBook();
                    else audio.togglePlayPause();
                    setTimeout(() => setShowKeyOverlay(null), 1000);
                    break;
                case 'ArrowLeft':
                    event.preventDefault();
                    audio.skipBackward(SKIP_BACKWARD_SECONDS);
                    setShowKeyOverlay('backward');
                    setTimeout(() => setShowKeyOverlay(null), 1000);
                    break;
                case 'ArrowRight':
                    event.preventDefault();
                    audio.skipForward(SKIP_FORWARD_SECONDS);
                    setShowKeyOverlay('forward');
                    setTimeout(() => setShowKeyOverlay(null), 1000);
                    break;
            }
        };

        document.addEventListener('keydown', handleKeyPress);

        return () => {
            document.removeEventListener('keydown', handleKeyPress);
        };
    }, [audio.togglePlayPause, audio.skipForward, audio.skipBackward, audio.isPlaying, isPreview, book, bookId]);

    const audioLoading = audio.isLoading && !isPreview;
    if (audioLoading || isLoadingBookData || !book) {
        return <LoadingState message={audioLoading ? t('player.loadingAudio') : t('player.loadingBookData')}/>;
    }

    if (error || (audio.error && !isPreview)) {
        return <ErrorState error={error || audio.error || ''} onRetry={() => navigate('/')}/>;
    }

    // The user's own file: nothing to download from Storytel (and nothing to delete).
    const isLocal = isLocalBook(book, bookId);
    const chapterList = chapters.chapters.length > 0 ? chapters.chapters : audio.chapters;
    const isStarred = !!bookId && starredIds.includes(bookId);
    const downloadLabel = isDownloading
        ? t('player.downloading', 'Downloading…')
        : isDownloaded
            ? t('player.downloaded', 'Downloaded')
            : t('player.download');

    return (
        <div className="flex-1 flex flex-col relative bg-[#0A0A0A] text-white">
            <Navbar barTitle={t('player.nowPlaying')} onBackClick={() => navigate('/')}>
                {/* Up next: the same star as on the library cards. */}
                {bookId && (
                    <button
                        type="button"
                        onClick={() => upNext.toggle(bookId)}
                        aria-pressed={isStarred}
                        aria-label={isStarred ? t('upNext.removeStar') : t('upNext.addStar')}
                        title={isStarred ? t('upNext.removeStar') : t('upNext.addStar')}
                        className={`w-9 h-9 rounded-[10px] flex items-center justify-center hover:bg-white/[0.06] transition-colors focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF5100] ${
                            isStarred ? 'text-[#FF7A3D] hover:text-[#FF9A66]' : 'text-[#9CA3AF] hover:text-[#FF7A3D]'
                        }`}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill={isStarred ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} strokeLinejoin="round" aria-hidden="true">
                            <path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z"/>
                        </svg>
                    </button>
                )}
                {/* Download (offline listening): a quiet icon. An arrow, or arrow with a check
                    once downloaded; clicking a downloaded book offers to delete the file. */}
                {!isLocal && (
                    <button
                        id="download-btn"
                        type="button"
                        onClick={handleDownloadClick}
                        aria-label={downloadLabel}
                        title={downloadLabel}
                        className="w-9 h-9 rounded-[10px] flex items-center justify-center text-[#9CA3AF] hover:text-white hover:bg-white/[0.06] transition-colors focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF5100]"
                    >
                        {isDownloading ? (
                            <span aria-hidden="true" className="w-4 h-4 rounded-full border-2 border-white/15 border-t-[#9CA3AF] animate-spin"/>
                        ) : (
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M5 20h14"/>
                                <path d={isDownloaded ? 'M7 11l3.5 3.5L17 7' : 'M12 4v11M7 10l5 5 5-5'}/>
                            </svg>
                        )}
                    </button>
                )}
            </Navbar>

            {/* Keyboard Overlay */}
            {showKeyOverlay && (
                <div className="fixed inset-0 flex items-center justify-center pointer-events-none z-50">
                    <div className="w-24 h-24 rounded-full bg-black/70 flex items-center justify-center">
                        <svg
                            className="w-12 h-12 text-white"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            xmlns="http://www.w3.org/2000/svg"
                            aria-hidden="true"
                        >
                            {showKeyOverlay === 'play' && (
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                      d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/>
                            )}
                            {showKeyOverlay === 'pause' && (
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                      d="M10 9v6M14 9v6"/>
                            )}
                            {showKeyOverlay === 'backward' && (
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                      d="M12.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0019 16V8a1 1 0 00-1.6-.8l-5.333 4zM4.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0011 16V8a1 1 0 00-1.6-.8l-5.334 4z"/>
                            )}
                            {showKeyOverlay === 'forward' && (
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                      d="M11.933 12.8a1 1 0 000-1.6L6.6 7.2A1 1 0 005 8v8a1 1 0 001.6.8l5.333-4zM19.933 12.8a1 1 0 000-1.6l-5.333-4A1 1 0 0013 8v8a1 1 0 001.6.8l5.333-4z"/>
                            )}
                        </svg>
                    </div>
                </div>
            )}

            {/* One centred column; my-auto keeps it centred yet scrollable when too tall */}
            <div className="flex-1 flex flex-col px-6 pt-16 pb-8">
                <div className="my-auto w-full flex flex-col items-center">
                    <BookInfo
                        book={book}
                        currentChapter={chapters.currentChapter || (isPreview ? null : audio.currentChapter)}
                        chapters={chapterList}
                        currentTime={shownTime}
                        playbackRate={audio.playbackRate}
                        onShowChaptersModal={() => chapters.setShowChaptersModal(true)}
                        isPlaying={audio.isPlaying && !isPreview}
                    />

                    <PlayerControls
                        isPlaying={audio.isPlaying && !isPreview}
                        currentTime={shownTime}
                        duration={shownDuration}
                        playbackRate={audio.playbackRate}
                        seekDisabled={isPreview}
                        onPlayPause={isPreview ? playThisBook : audio.togglePlayPause}
                        onSeek={audio.seek}
                        onSkipForward={() => audio.skipForward(SKIP_FORWARD_SECONDS)}
                        onSkipBackward={() => audio.skipBackward(SKIP_BACKWARD_SECONDS)}
                    />
                </div>
            </div>


            {/* Modals */}


            <ChaptersModal
                isOpen={chapters.showChaptersModal}
                chapters={chapterList}
                currentTime={shownTime}
                playbackRate={audio.playbackRate}
                onClose={() => chapters.setShowChaptersModal(false)}
                onChapterClick={(time) => {
                    if (!isPreview) audio.seek(time);
                    chapters.setShowChaptersModal(false);
                }}
            />


            {/* Download Cancel/Delete Modal */}
            <DownloadCancelModal
                isOpen={showDownloadCancelModal}
                isDownloading={isDownloading}
                onConfirm={handleCancelOrDelete}
                onCancel={() => setShowDownloadCancelModal(false)}
            />
        </div>
    );
}

export default PlayerView;
