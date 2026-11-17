import React, {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {useLocation, useNavigate, useParams} from 'react-router-dom';
import {useTranslation} from 'react-i18next';
import {BookShelfEntity} from "../interfaces/books";
import Navbar from './Navbar';
import {addToBookshelfErrorKey, buildCoverUrl, localizedLanguageName, removeFromBookshelfErrorKey, truncateTitle} from '../utils/helpers';
import ConfirmRemoveBookModal from './ConfirmRemoveBookModal';
import api from '../utils/api';
import "../types/window.d.ts";

function BookView() {
    const {t, i18n} = useTranslation();
    const {bookId} = useParams();
    const location = useLocation();
    const navigate = useNavigate();

    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [showFullDescription, setShowFullDescription] = useState(false);
    const [fetchedBook, setFetchedBook] = useState<BookShelfEntity | null>(null);

    const book: BookShelfEntity | null = location.state?.book || fetchedBook;

    // description and language are not part of the bookshelf payload; they come
    // from the per-book book-details endpoint, fetched lazily below.
    const [description, setDescription] = useState('');
    const [language, setLanguage] = useState('');

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
                    setLanguage(localizedLanguageName(data.language, i18n.language));
                })
                .catch((err) => {
                    console.error('Failed to fetch book details:', err);
                    setError(t('bookView.loadError', 'Failed to load book details'));
                })
                .finally(() => {
                    setIsLoading(false);
                });
        }
    }, [bookId, location.state, i18n.language, t]);

    useEffect(() => {
        if (book) {
            document.title = truncateTitle(book.book.name);
        }

        return () => {
            document.title = 'Storytel Player';
        };
    }, [book]);

    // Fetch description and language from the book-details endpoint if book was passed via state.
    useEffect(() => {
        const consumableId = book?.book?.consumableId;
        if (!consumableId || fetchedBook) return;
        let cancelled = false;
        api.get(`/book-details/${consumableId}`)
            .then((res) => {
                if (cancelled) return;
                const data = res.data || {};
                setDescription(data.description || '');
                setLanguage(localizedLanguageName(data.language, i18n.language));
            })
            .catch(() => {
                /* keep empty fallbacks on failure */
            });
        return () => {
            cancelled = true;
        };
    }, [book, fetchedBook, i18n.language]);

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

    const handlePlayBook = () => {
        navigate(`/player/${bookId}`, {state: {book, autoPlay: true}});
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

    const details = [
        {label: t('bookView.duration'), value: totalDuration > 0 ? formatDuration(totalDuration) : ''},
        {label: t('bookView.narrator'), value: book.abook?.narratorAsString || ''},
        {label: t('bookView.language'), value: language},
        {label: t('bookView.category'), value: book.book.category?.title || ''},
    ].filter((d) => d.value);

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

            <div className="m-auto w-full max-w-[880px] flex flex-wrap items-center gap-10">
                {/* Book Cover */}
                <img
                    src={buildCoverUrl(book.book.largeCover || book.book.largeCoverE)}
                    alt={book.book.name}
                    className="flex-[0_0_220px] w-[220px] h-[220px] object-cover rounded-[14px] shadow-[0_20px_50px_rgba(0,0,0,0.55)]"
                />

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
                        <dl className="grid grid-cols-4 gap-3 py-3.5 border-y border-white/[0.08]">
                            {details.map((d) => (
                                <div key={d.label} className="min-w-0">
                                    <dt className="text-[11px] text-[#9CA3AF]">{d.label}</dt>
                                    <dd className="mt-0.5 text-[13px] break-words">{d.value}</dd>
                                </div>
                            ))}
                        </dl>
                    )}

                    {/* Actions */}
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={handlePlayBook}
                            className={`h-10 px-[18px] rounded-[10px] bg-[#FF5100] hover:bg-[#ff641a] text-[#0A0A0A] text-[14px] font-semibold flex items-center gap-2 transition-colors ${focusRing}`}
                        >
                            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M9 6.8v10.4a1 1 0 001.5.86l8.3-5.2a1 1 0 000-1.72l-8.3-5.2A1 1 0 009 6.8z"/>
                            </svg>
                            {hasProgress
                                ? t('bookView.continueWithProgress', {defaultValue: 'Continue · {{percent}}%', percent: progressPercent})
                                : t('bookView.listen', 'Listen')}
                        </button>

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
                    </div>

                    {/* Description */}
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
