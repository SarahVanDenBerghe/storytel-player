import React, {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {useLocation, useNavigate, useParams} from 'react-router-dom';
import {useTranslation} from 'react-i18next';
import {BookShelfEntity} from "../interfaces/books";
import Navbar from './Navbar';
import {addToBookshelfErrorKey, buildCoverUrl, otherBookParts, removeFromBookshelfErrorKey, truncateTitle} from '../utils/helpers';
import {useAudioContext} from '../contexts/AudioContext';
import {ensureAudioDownloaded} from '../utils/readAlongAudio';
import ConfirmRemoveBookModal from './ConfirmRemoveBookModal';
import api from '../utils/api';
import "../types/window.d.ts";

function BookView() {
    const {t} = useTranslation();
    const audio = useAudioContext();
    const {bookId} = useParams();
    const location = useLocation();
    const navigate = useNavigate();

    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [showFullDescription, setShowFullDescription] = useState(false);
    const [fetchedBook, setFetchedBook] = useState<BookShelfEntity | null>(null);

    const book: BookShelfEntity | null = location.state?.book || fetchedBook;

    // The description is not part of the bookshelf payload; it comes from the
    // per-book book-details endpoint, fetched lazily below.
    const [description, setDescription] = useState('');

    useEffect(() => {
        if (!location.state?.book && bookId) {
            setIsLoading(true);
            api.get(`/book-details/${bookId}`)
                .then((res) => {
                    const data = res.data || {};
                    const formats = data.formats || [];
                    const abook = formats.find((f: any) => f.type === 'abook');
                    const ebook = formats.find((f: any) => f.type === 'ebook');
                    const cover = abook?.cover?.url || ebook?.cover?.url || data.cover?.url || '';
                    const authors = (data.authors || []).map((a: any) => a.name).join(', ');
                    const narrators = (data.narrators || []).map((n: any) => n.name).join(', ');
                    const entity: any = {
                        id: bookId,
                        status: 1,
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
                    setDescription(data.description || '');
                })
                .catch((err) => {
                    console.error('Failed to fetch book details:', err);
                    setError(t('bookView.loadError', 'Failed to load book details'));
                })
                .finally(() => {
                    setIsLoading(false);
                });
        }
    }, [bookId, location.state, t]);

    useEffect(() => {
        if (book) {
            document.title = truncateTitle(book.book.name);
        }

        return () => {
            document.title = 'Storytel Player';
        };
    }, [book]);

    // Fetch the description from the book-details endpoint if book was passed via state.
    useEffect(() => {
        const consumableId = book?.book?.consumableId;
        if (!consumableId || fetchedBook) return;
        let cancelled = false;
        api.get(`/book-details/${consumableId}`)
            .then((res) => {
                if (cancelled) return;
                const data = res.data || {};
                setDescription(data.description || '');
            })
            .catch(() => {
                /* keep empty fallbacks on failure */
            });
        return () => {
            cancelled = true;
        };
    }, [book, fetchedBook]);

    const [isSaving, setIsSaving] = useState(false);
    const [isSaved, setIsSaved] = useState(!!location.state?.book);
    const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
    const [saveToast, setSaveToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const handleSaveToLibrary = async () => {
        if (isSaved || isSaving) return;
        const consumableId = book?.book?.consumableId || bookId;
        if (!consumableId) return;

        try {
            setIsSaving(true);
            await api.post('/bookshelf/add', { consumableId: String(consumableId) });
            setIsSaved(true);
            window.dispatchEvent(new Event('bookshelfUpdated'));
            setSaveToast({
                type: 'success',
                text: t('bookView.savedToLibrary', 'Book added to your library!'),
            });
            setTimeout(() => setSaveToast(null), 3000);
        } catch (err: any) {
            console.error('Failed to add book to bookshelf:', err);
            setSaveToast({
                type: 'error',
                text: t(addToBookshelfErrorKey(err)),
            });
            setTimeout(() => setSaveToast(null), 4500);
        } finally {
            setIsSaving(false);
        }
    };

    const handleRemoveFromLibrary = async () => {
        const consumableId = book?.book?.consumableId || bookId;
        if (!consumableId || isSaving) return;

        try {
            setIsSaving(true);
            await api.post('/bookshelf/remove', { consumableId: String(consumableId) });
            setIsSaved(false);
            setShowRemoveConfirm(false);
            window.dispatchEvent(new Event('bookshelfUpdated'));
            setSaveToast({ type: 'success', text: t('bookshelf.removed') });
            setTimeout(() => setSaveToast(null), 3000);
        } catch (err: any) {
            console.error('Failed to remove book from bookshelf:', err);
            setShowRemoveConfirm(false);
            setSaveToast({ type: 'error', text: t(removeFromBookshelfErrorKey(err)) });
            setTimeout(() => setSaveToast(null), 4500);
        } finally {
            setIsSaving(false);
        }
    };

    // Read along: attach an EPUB without starting playback. The main process
    // stores it per book (as ReadingView does); the audio is then downloaded
    // if needed and the Whisper sync starts from the beginning.
    const epubApi = window.electronEpub;
    const [epubName, setEpubName] = useState<string | null>(null);
    // Read-along state shown on the EPUB button: downloading the audio (percent),
    // then the sync job's progress.
    const [preparingPercent, setPreparingPercent] = useState<number | null>(null);
    const [syncProgress, setSyncProgress] = useState<ReadAlongSyncProgress | null>(null);
    const [audioOnDisk, setAudioOnDisk] = useState<boolean | null>(null);
    const bookName = book?.book?.name;

    useEffect(() => {
        const epub = window.electronEpub;
        if (!bookId || !epub) return;
        setSyncProgress(null);
        setAudioOnDisk(null);
        epub.syncGet(bookId).then((snapshot) => setSyncProgress(snapshot.progress)).catch(() => undefined);
        api.get(`/download-status/${bookId}`)
            .then((res) => setAudioOnDisk(!!res.data?.downloaded))
            .catch(() => undefined);
        return epub.onSyncProgress((progress) => {
            if (progress.bookId === bookId) setSyncProgress(progress);
        });
    }, [bookId]);

    const prepareAndSync = async () => {
        if (!bookId || !epubApi || preparingPercent !== null) return;
        setPreparingPercent(0);
        try {
            const ok = await ensureAudioDownloaded(bookId, book?.book?.consumableId, book, setPreparingPercent);
            if (!ok) return;
            setAudioOnDisk(true);
            setSyncProgress(await epubApi.syncStart(bookId, 0));
        } catch (err) {
            console.error('Read along: cannot prepare the audio', err);
        } finally {
            setPreparingPercent(null);
        }
    };

    useEffect(() => {
        const epub = window.electronEpub;
        if (!bookId || !epub || !book) return;
        let alive = true;
        setEpubName(null);
        (async () => {
            let name = await epub.name(bookId);
            if (!name) {
                // Another part of a multi-part book may already have one: share it.
                const shelf = await api.get('/bookshelf').then((res) => res.data?.books || []).catch(() => []);
                for (const part of otherBookParts(book, shelf)) {
                    const partId = String(part.abook?.id || part.id);
                    if (await epub.name(partId)) {
                        await epub.link(partId, [bookId]);
                        name = await epub.name(bookId);
                        break;
                    }
                }
            }
            if (alive) setEpubName(name);
        })().catch(() => undefined);
        return () => {
            alive = false;
        };
        // Re-run per book, not per render of the same book entity.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bookId, bookName]);

    // The EPUB popover (file name, replace with confirmation). Cancelling the file
    // dialog keeps the current EPUB.
    const [epubMenu, setEpubMenu] = useState<'closed' | 'open' | 'confirmReplace'>('closed');
    const epubMenuRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (epubMenu === 'closed') return;
        const closeOutside = (e: MouseEvent) => {
            if (!epubMenuRef.current?.contains(e.target as Node)) setEpubMenu('closed');
        };
        const closeOnEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setEpubMenu('closed');
        };
        document.addEventListener('mousedown', closeOutside);
        document.addEventListener('keydown', closeOnEscape);
        return () => {
            document.removeEventListener('mousedown', closeOutside);
            document.removeEventListener('keydown', closeOnEscape);
        };
    }, [epubMenu]);

    const chooseEpub = async () => {
        setEpubMenu('closed');
        if (!bookId || !epubApi || !book) return;
        try {
            const chosen = await epubApi.choose(bookId);
            if (!chosen) return;
            setEpubName(chosen.name);
            // The other parts of a multi-part book read from the same EPUB.
            const shelf = await api.get('/bookshelf').then((res) => res.data?.books || []).catch(() => []);
            const parts = otherBookParts(book, shelf).map((part: BookShelfEntity) => String(part.abook?.id || part.id));
            if (parts.length > 0) await epubApi.link(bookId, parts);
            await prepareAndSync();
        } catch (err) {
            console.error('Read along: cannot attach the EPUB', err);
        }
    };

    // The cover is the play button: start or continue here; the footer player shows it.
    const handlePlayBook = () => {
        if (!bookId) return;
        void audio.loadBook(book, bookId, true);
    };

    // Show the "show more" toggle only when the 4-line clamp actually cuts text.
    const descriptionRef = useRef<HTMLParagraphElement>(null);
    const [isDescriptionClamped, setIsDescriptionClamped] = useState(false);

    useLayoutEffect(() => {
        const el = descriptionRef.current;
        if (!el || showFullDescription) return;
        const measure = () => setIsDescriptionClamped(el.scrollHeight > el.clientHeight + 1);
        measure();
        window.addEventListener('resize', measure);
        return () => window.removeEventListener('resize', measure);
    }, [description, showFullDescription, book]);

    const goHome = () => navigate('/');

    // Shared page shell: corner back button over a scrolling, centred content area.
    const renderShell = (content: React.ReactNode) => (
        <div className="relative flex-1 min-h-0 flex flex-col bg-[#0A0A0A] text-white selection:bg-[#FF5100] selection:text-white">
            <Navbar barTitle={t('bookView.details')} onBackClick={goHome}/>
            <div className="flex-1 min-h-0 overflow-auto flex flex-col px-6 pt-16 pb-10">
                {content}
            </div>
        </div>
    );

    const renderErrorState = (message: string) => renderShell(
        <div role="alert" className="m-auto max-w-sm text-center">
            <h1 className="text-[15px] font-semibold text-white">{t('errorState.title')}</h1>
            <p className="mt-2 text-[13px] text-[#9CA3AF]">{message}</p>
            <button
                type="button"
                onClick={goHome}
                className="mt-5 h-10 px-4 rounded-[10px] bg-white/[0.06] hover:bg-white/10 text-[#D1D5DB] text-[13px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF5100]"
            >
                {t('errorState.tryAgain')}
            </button>
        </div>
    );

    if (isLoading) {
        return renderShell(
            <div role="status" className="m-auto flex flex-col items-center gap-3">
                <div className="h-8 w-8 rounded-full border-2 border-white/10 border-t-[#FF5100] animate-spin" aria-hidden="true"/>
                <span className="text-[13px] text-[#9CA3AF]">{t('common.loading')}</span>
            </div>
        );
    }

    if (error) {
        return renderErrorState(error);
    }

    if (!book) {
        return renderErrorState(t('common.error'));
    }

    const formatDuration = (microseconds: number) => {
        const hours = Math.floor(microseconds / 3600000000);
        const minutes = Math.floor((microseconds % 3600000000) / 60000000);
        return `${hours} h ${minutes} min`;
    };

    // Listening progress, same formula as BookCard (positions are in microseconds).
    const totalDuration = book.abook?.time || 0;
    const position = book.abookMark?.pos || 0;
    const progressPercent = totalDuration > 0
        ? Math.round(Math.min(Math.max((position / totalDuration) * 100, 0), 100))
        : 0;
    const hasProgress = position > 0 && totalDuration > 0;

    const series = book.book.series?.[0];
    const seriesLabel = series?.name
        ? `${series.name}${book.book.seriesOrder ? ` ${book.book.seriesOrder}` : ''}`
        : '';

    // Dramatized adaptations list a dozen narrators: show two, the rest on hover.
    const narrators = (book.abook?.narratorAsString || '').split(',').map((n) => n.trim()).filter(Boolean);
    const narratorText = narrators.length > 2
        ? `${narrators.slice(0, 2).join(', ')} ${t('bookView.moreNarrators', {count: narrators.length - 2})}`
        : narrators.join(', ');

    const details: {label: string; value: string; title?: string}[] = [
        {label: t('bookView.duration'), value: totalDuration > 0 ? formatDuration(totalDuration) : ''},
        {label: t('bookView.narrator'), value: narratorText, title: narrators.length > 2 ? narrators.join(', ') : undefined},
        {label: t('bookView.category'), value: book.book.category?.title || ''},
    ].filter((d) => d.value);

    const syncing = syncProgress?.state === 'running';
    const epubButtonLabel = preparingPercent !== null
        ? t('bookView.preparingAudio', {percent: preparingPercent})
        : syncing && syncProgress && syncProgress.chunksTotal > 0
            ? t('bookView.syncingProgress', {done: syncProgress.chunksDone, total: syncProgress.chunksTotal})
            : epubName ? t('bookView.epub') : t('bookView.chooseEpub');

    const playLabel = hasProgress
        ? t('bookView.continueWithProgress', {defaultValue: 'Continue · {{percent}}%', percent: progressPercent})
        : t('bookView.listen', 'Listen');

    const focusRing = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF5100]';

    return renderShell(
        <>
            {/* Toast Notification */}
            {saveToast && (
                <div
                    role="status"
                    className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-[10px] text-[13px] font-medium shadow-2xl bg-[#17171A] border border-white/10 ${
                        saveToast.type === 'error' ? 'text-red-300' : 'text-[#E5E7EB]'
                    }`}
                >
                    {saveToast.text}
                </div>
            )}

            <div className="m-auto w-full max-w-[880px] flex flex-col gap-8">
                {/* Header: cover (the play button) | metadata */}
                <div className="flex flex-wrap items-end gap-7">
                    <div className="flex-[0_0_180px] flex flex-col items-center gap-2">
                        <button
                            type="button"
                            onClick={handlePlayBook}
                            aria-label={playLabel}
                            title={playLabel}
                            className={`group/cover relative w-[180px] h-[180px] rounded-[14px] overflow-hidden bg-[#1F2937] border border-white/[0.08] shadow-[0_20px_50px_rgba(0,0,0,0.55)] ${focusRing}`}
                        >
                            <img
                                src={buildCoverUrl(book.book.largeCover || book.book.largeCoverE)}
                                alt=""
                                className="w-full h-full object-cover"
                            />
                            <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 group-hover/cover:opacity-100 group-focus-visible/cover:opacity-100 transition-opacity">
                                <span className="w-14 h-14 rounded-full bg-[#FF5100] text-[#0A0A0A] flex items-center justify-center shadow-[0_6px_20px_rgba(255,81,0,0.35)]">
                                    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M9 6.8v10.4a1 1 0 001.5.86l8.3-5.2a1 1 0 000-1.72l-8.3-5.2A1 1 0 009 6.8z"/>
                                    </svg>
                                </span>
                            </span>
                            {hasProgress && (
                                <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1 bg-black/50">
                                    <span className="block h-full bg-[#FF5100]" style={{width: `${progressPercent}%`}}/>
                                </span>
                            )}
                        </button>
                        {hasProgress && (
                            <span className="text-[12px] text-[#9CA3AF] tabular-nums">
                                {t('bookView.progress', {percent: progressPercent})}
                            </span>
                        )}
                    </div>

                    <div className="flex-[1_1_360px] min-w-0 flex flex-col gap-3.5">
                        {/* Title, author, series */}
                        <div>
                            <h1 className="text-[20px] font-semibold leading-[1.3] break-words">{book.book.name}</h1>
                            {(book.book.authorsAsString || seriesLabel) && (
                                <p className="mt-1.5 text-[13px] text-[#D1D5DB]">
                                    {book.book.authorsAsString}
                                    {seriesLabel && (
                                        <span className="text-[#9CA3AF]">
                                            {book.book.authorsAsString ? ' · ' : ''}{seriesLabel}
                                        </span>
                                    )}
                                </p>
                            )}
                        </div>

                        {/* Details */}
                        {details.length > 0 && (
                            <dl className="grid grid-cols-3 gap-3 py-3.5 border-y border-white/[0.08]">
                                {details.map((d) => (
                                    <div key={d.label} className="min-w-0">
                                        <dt className="text-[11px] text-[#9CA3AF]">{d.label}</dt>
                                        <dd className="mt-0.5 text-[13px] break-words" title={d.title}>{d.value}</dd>
                                    </div>
                                ))}
                            </dl>
                        )}

                        {/* Actions */}
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={isSaved ? () => setShowRemoveConfirm(true) : handleSaveToLibrary}
                                disabled={isSaving}
                                title={isSaved ? t('bookshelf.remove') : undefined}
                                className={`group/save h-10 px-3.5 rounded-[10px] border border-white/[0.14] bg-transparent text-[#D1D5DB] text-[13px] flex items-center gap-2 transition-colors hover:bg-white/[0.06] disabled:opacity-60 ${
                                    isSaved ? 'hover:text-red-300 hover:border-red-400/40' : 'hover:text-white'
                                } ${focusRing}`}
                            >
                                {isSaving ? (
                                    <span aria-hidden="true" className="h-3.5 w-3.5 rounded-full border-2 border-white/15 border-t-[#FF5100] animate-spin"/>
                                ) : isSaved ? (
                                    <>
                                        <svg aria-hidden="true" className="group-hover/save:hidden" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M5 12l5 5 9-10"/>
                                        </svg>
                                        <svg aria-hidden="true" className="hidden group-hover/save:block" width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                                        </svg>
                                    </>
                                ) : (
                                    <svg aria-hidden="true" width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M12 5v14m7-7H5"/>
                                    </svg>
                                )}
                                <span className={isSaved ? 'group-hover/save:hidden' : undefined}>
                                    {isSaved ? t('bookView.inLibrary') : t('bookView.addToLibrary')}
                                </span>
                                {isSaved && (
                                    <span className="hidden group-hover/save:inline">{t('bookshelf.remove')}</span>
                                )}
                            </button>

                            {epubApi && (
                                <div className="relative" ref={epubMenuRef}>
                                    <button
                                        type="button"
                                        onClick={epubName ? () => setEpubMenu(epubMenu === 'closed' ? 'open' : 'closed') : chooseEpub}
                                        aria-expanded={epubName ? epubMenu !== 'closed' : undefined}
                                        className={`h-10 px-3.5 rounded-[10px] border border-white/[0.14] bg-transparent text-[#D1D5DB] text-[13px] flex items-center gap-2 transition-colors hover:bg-white/[0.06] hover:text-white ${focusRing}`}
                                    >
                                        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                             strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M2 5h7a3 3 0 013 3v12a2 2 0 00-2-2H2zM22 5h-7a3 3 0 00-3 3v12a2 2 0 012-2h8z"/>
                                        </svg>
                                        {epubButtonLabel}
                                    </button>
                                    {epubName && epubMenu !== 'closed' && (
                                        <div className="absolute top-full left-0 mt-1.5 w-72 bg-[#17171A] border border-white/[0.10] rounded-[14px] shadow-[0_24px_60px_rgba(0,0,0,0.6)] p-3 z-50 flex flex-col gap-2">
                                            <div className="text-[11px] font-bold text-[#9CA3AF] uppercase tracking-wider">{t('bookView.epubTitle')}</div>
                                            <div className="text-[13px] text-[#E5E7EB] break-words">{epubName}</div>
                                            {syncing && <div className="text-[12px] text-[#9CA3AF]">{t('bookView.epubSyncing')}</div>}
                                            {audioOnDisk === false && preparingPercent === null && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setEpubMenu('closed');
                                                        void prepareAndSync();
                                                    }}
                                                    className={`self-start mt-1 h-8 px-3 rounded-[8px] bg-[#FF5100] hover:bg-[#ff641a] text-[#0A0A0A] text-[12px] font-semibold transition-colors ${focusRing}`}
                                                >
                                                    {t('bookView.prepareAudio')}
                                                </button>
                                            )}
                                            {epubMenu === 'open' ? (
                                                <button
                                                    type="button"
                                                    onClick={() => setEpubMenu('confirmReplace')}
                                                    className={`self-start mt-1 h-8 px-3 rounded-[8px] bg-white/[0.06] hover:bg-white/[0.10] text-[#D1D5DB] hover:text-white text-[12px] font-semibold transition-colors ${focusRing}`}
                                                >
                                                    {t('bookView.replaceEpub')}
                                                </button>
                                            ) : (
                                                <div role="alertdialog" aria-label={t('bookView.replaceEpub')} className="mt-1 flex flex-col gap-2">
                                                    <p className="text-[12px] leading-[1.5] text-[#D1D5DB]">{t('bookView.replaceConfirm', {name: epubName})}</p>
                                                    <div className="flex gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => setEpubMenu('open')}
                                                            className={`h-8 px-3 rounded-[8px] bg-white/[0.06] hover:bg-white/[0.10] text-[#D1D5DB] text-[12px] font-semibold transition-colors ${focusRing}`}
                                                        >
                                                            {t('common.cancel')}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={chooseEpub}
                                                            className={`h-8 px-3 rounded-[8px] bg-[#FF5100] hover:bg-[#ff641a] text-[#0A0A0A] text-[12px] font-semibold transition-colors ${focusRing}`}
                                                        >
                                                            {t('bookView.chooseNewFile')}
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div>
                    {/* Summary */}
                    <div>
                        <p
                            ref={descriptionRef}
                            className={`text-[14px] leading-[1.65] text-[#D1D5DB] ${showFullDescription ? '' : 'line-clamp-4'}`}
                        >
                            {description || t('bookView.noDescription')}
                        </p>
                        {(isDescriptionClamped || showFullDescription) && (
                            <button
                                type="button"
                                onClick={() => setShowFullDescription(!showFullDescription)}
                                aria-expanded={showFullDescription}
                                className={`mt-1.5 text-[13px] font-medium text-[#FF7A3D] hover:text-[#FF9A6B] rounded-sm transition-colors ${focusRing}`}
                            >
                                {showFullDescription ? t('bookView.showLess') : t('bookView.showMore')}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <ConfirmRemoveBookModal
                isOpen={showRemoveConfirm}
                bookTitle={book?.book?.name || ''}
                isRemoving={isSaving}
                onConfirm={handleRemoveFromLibrary}
                onCancel={() => setShowRemoveConfirm(false)}
            />
        </>
    );
}

export default BookView;
