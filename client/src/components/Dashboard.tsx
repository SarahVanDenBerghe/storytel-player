import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../utils/api';
import BookCard from './BookCard';
import ConfirmRemoveBookModal from './ConfirmRemoveBookModal';
import { BookShelfEntity, BookShelfResponse } from '../interfaces/books';
import { removeFromBookshelfErrorKey } from '../utils/helpers';

interface DashboardProps {
  onLogout: () => void;
  onOpenSettings: () => void;
  triggerLogout?: boolean;
  setTriggerLogout?: (value: boolean) => void;
}

export function Dashboard({ onLogout, onOpenSettings }: DashboardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [books, setBooks] = useState<BookShelfEntity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterStatus, setFilterStatus] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [bookToRemove, setBookToRemove] = useState<BookShelfEntity | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const [toastMessage, setToastMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadBookshelf();
    const handleUpdate = () => {
      setFilterStatus(null);
      setSearchQuery('');
      loadBookshelf();
    };
    window.addEventListener('bookshelfUpdated', handleUpdate);
    return () => {
      window.removeEventListener('bookshelfUpdated', handleUpdate);
    };
  }, []);

  const loadBookshelf = async () => {
    try {
      setIsLoading(true);
      const response = await api.get<BookShelfResponse>('/bookshelf');
      setBooks(response.data.books || []);
    } catch (err: any) {
      try {
        const offline = await api.get<BookShelfResponse>('/offline/bookshelf');
        setBooks(offline.data?.books || []);
      } catch {
        setError(err.response?.data?.error || t('dashboard.loadError'));
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Filtered and sorted books
  const filteredBooks = useMemo(() => {
    if (books.length === 0) return [];

    let result = [...books];

    // Filter by status if selected
    if (filterStatus !== null) {
      result = result.filter((book) => {
        const s = +book.status;
        const pos = book.abookMark?.pos || 0;
        if (filterStatus === 1) {
          return s === 1 && pos === 0;
        }
        if (filterStatus === 2) {
          return s === 2 || (pos > 0 && s !== 3);
        }
        if (filterStatus === 3) {
          return s === 3;
        }
        return s === filterStatus;
      });
    }

    // Filter by local search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (book) =>
          book.book?.name?.toLowerCase().includes(q) ||
          book.book?.authorsAsString?.toLowerCase().includes(q) ||
          book.abook?.narratorAsString?.toLowerCase().includes(q)
      );
    }

    // Sort by most recently updated
    result.sort((a, b) => {
      const getTimestamp = (book: BookShelfEntity): number => {
        if (book.positionUpdatedTime) return new Date(book.positionUpdatedTime).getTime();
        if (book.stateUpdateTime) return new Date(book.stateUpdateTime).getTime();
        return 0;
      };
      return getTimestamp(b) - getTimestamp(a);
    });

    return result;
  }, [books, filterStatus, searchQuery]);

  const handleBookSelect = (book: BookShelfEntity) => {
    const bookId = book.abook?.id || book.id;
    // The full player is the book's page (no separate details page).
    navigate(`/player/${bookId}`, {
      state: { book },
    });
  };

  const handleQuickPlay = (e: React.MouseEvent, book: BookShelfEntity) => {
    e.stopPropagation();
    const bookId = book.abook?.id || book.id;
    navigate(`/player/${bookId}`, {
      state: { book, autoPlay: true },
    });
  };

  const handleRemoveBook = async () => {
    if (!bookToRemove || isRemoving) return;
    const consumableId = bookToRemove.book?.consumableId || bookToRemove.id;
    if (!consumableId) return;

    try {
      setIsRemoving(true);
      await api.post('/bookshelf/remove', { consumableId: String(consumableId) });
      setBookToRemove(null);
      setBooks((prev) => prev.filter((b) => b !== bookToRemove));
      setToastMessage({ type: 'success', text: t('bookshelf.removed', 'Removed from your library') });
      loadBookshelf();
    } catch (err: any) {
      console.error('Failed to remove book from bookshelf:', err);
      setBookToRemove(null);
      setToastMessage({ type: 'error', text: t(removeFromBookshelfErrorKey(err)) });
    } finally {
      setIsRemoving(false);
      setTimeout(() => setToastMessage(null), 4000);
    }
  };

  const focusRing =
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF5100]';
  const secondaryButton = `h-9 px-3 rounded-[10px] bg-white/[0.06] hover:bg-white/10 text-[#D1D5DB] text-[13px] font-medium transition-colors ${focusRing}`;

  const filters = [
    { status: null, label: t('dashboard.filters.all', 'All') },
    { status: 1, label: t('dashboard.filters.notStarted', 'Not started') },
    { status: 2, label: t('dashboard.filters.started', 'Started') },
    { status: 3, label: t('dashboard.filters.concluded', 'Concluded') },
  ];

  let body: React.ReactNode;
  if (isLoading) {
    body = (
      <div role="status" className="flex flex-col items-center gap-3 py-20 text-[13px] text-[#9CA3AF]">
        <div className="w-6 h-6 rounded-full border-2 border-white/10 border-t-[#FF5100] animate-spin" aria-hidden="true" />
        {t('dashboard.loading', 'Loading your library...')}
      </div>
    );
  } else if (error) {
    body = (
      <div className="max-w-sm mx-auto py-20 text-center">
        <h2 className="text-[15px] font-semibold text-white mb-1">{t('errorState.title')}</h2>
        <p className="text-[13px] text-[#9CA3AF] mb-5">{error}</p>
        <div className="flex justify-center gap-2">
          <button type="button" onClick={() => window.location.reload()} className={secondaryButton}>
            {t('errorState.tryAgain')}
          </button>
          <button type="button" onClick={onLogout} className={secondaryButton}>
            {t('errorState.logout')}
          </button>
        </div>
      </div>
    );
  } else if (books.length === 0) {
    body = (
      <div className="max-w-sm mx-auto py-20 text-center">
        <h2 className="text-[15px] font-semibold text-white mb-1">{t('dashboard.noBooks', 'No books found')}</h2>
        <p className="text-[13px] text-[#9CA3AF] mb-5">
          {t('dashboard.emptyLibrary', 'Your library appears to be empty.')}
        </p>
        <button type="button" onClick={() => navigate('/search')} className={secondaryButton}>
          {t('dashboard.exploreCatalog', 'Explore the catalog (⌘K)')}
        </button>
      </div>
    );
  } else if (filteredBooks.length === 0) {
    body = (
      <div className="max-w-sm mx-auto py-20 text-center">
        <h2 className="text-[15px] font-semibold text-white mb-5">
          {t('dashboard.noFilterMatch', 'No books matched your filter.')}
        </h2>
        <button
          type="button"
          onClick={() => {
            setFilterStatus(null);
            setSearchQuery('');
          }}
          className={secondaryButton}
        >
          {t('dashboard.resetFilters', 'Reset filters')}
        </button>
      </div>
    );
  } else {
    body = (
      <div className="max-w-[1000px] mx-auto grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-7 gap-y-8">
        {filteredBooks
          .filter((book) => !!book?.abook || !!book?.book)
          .map((book) => (
            <BookCard
              key={book.abook?.id || book.id || book.book?.consumableId}
              book={book}
              onBookSelect={handleBookSelect}
              onRemove={setBookToRemove}
              onQuickPlay={handleQuickPlay}
            />
          ))}
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-[#0A0A0A] text-white selection:bg-[#FF5100] selection:text-white">
      {/* Header row: title, count, progress filters, library filter, find books, settings */}
      <header className="titlebar-inset flex-shrink-0 flex flex-wrap items-center gap-3 px-6 pt-4 pb-3">
        <h1 className="m-0 text-[15px] font-semibold">{t('dashboard.title', 'My Library')}</h1>
        {!isLoading && !error && (
          <span className="text-[13px] text-[#9CA3AF]">{t('dashboard.bookCount', { count: books.length })}</span>
        )}
        <div
          role="group"
          aria-label={t('dashboard.filters.label', 'Filter by progress')}
          className="ml-2 flex gap-0.5 p-0.5 rounded-[10px] bg-white/[0.06]"
        >
          {filters.map(({ status, label }) => {
            const isActive = filterStatus === status;
            return (
              <button
                key={String(status)}
                type="button"
                aria-pressed={isActive}
                onClick={() => setFilterStatus(status)}
                className={`h-[30px] px-3 rounded-lg text-[12px] font-medium transition-colors ${focusRing} ${
                  isActive ? 'bg-[#2A2A2E] text-white' : 'bg-transparent text-[#9CA3AF] hover:text-white'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        <span className="flex-1" />

        <label className="relative flex items-center">
          <span className="sr-only">{t('dashboard.search', 'Search my library...')}</span>
          <svg
            aria-hidden="true"
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            className="absolute left-2.5 text-[#9CA3AF] pointer-events-none"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('dashboard.search', 'Search my library...')}
            className={`w-[200px] h-9 pl-8 ${searchQuery ? 'pr-8' : 'pr-2.5'} rounded-[10px] border border-white/10 bg-transparent text-white text-[13px] placeholder-[#9CA3AF] focus:outline-none focus-visible:border-[#FF5100]`}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label={t('common.close', 'Close')}
              className={`absolute right-1.5 w-6 h-6 rounded-md flex items-center justify-center text-[#9CA3AF] hover:text-white ${focusRing}`}
            >
              <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </label>

        <button
          type="button"
          onClick={() => navigate('/search')}
          className={`h-9 px-3 rounded-[10px] bg-white/[0.06] hover:bg-white/10 text-[#E5E7EB] text-[13px] font-medium flex items-center gap-2 transition-colors ${focusRing}`}
        >
          {t('dashboard.findBooks', 'Find books')}
          <span className="text-[11px] text-[#9CA3AF]">⌘K</span>
        </button>

        <button
          type="button"
          onClick={onOpenSettings}
          aria-label={t('settings.title', 'Settings')}
          title={t('settings.title', 'Settings')}
          className={`w-9 h-9 rounded-[10px] flex items-center justify-center text-[#9CA3AF] hover:text-white hover:bg-white/[0.06] transition-colors ${focusRing}`}
        >
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" />
          </svg>
        </button>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-10 pt-4 pb-12">{body}</div>

      <ConfirmRemoveBookModal
        isOpen={!!bookToRemove}
        bookTitle={bookToRemove?.book?.name || ''}
        isRemoving={isRemoving}
        onConfirm={handleRemoveBook}
        onCancel={() => setBookToRemove(null)}
      />

      {toastMessage && (
        <div
          className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl text-xs font-medium shadow-2xl backdrop-blur-md border animate-in fade-in slide-in-from-bottom-2 ${
            toastMessage.type === 'success'
              ? 'bg-green-950/90 text-green-300 border-green-700/50'
              : 'bg-red-950/90 text-red-300 border-red-700/50'
          }`}
        >
          {toastMessage.text}
        </div>
      )}
    </div>
  );
}

export default Dashboard;
