import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../utils/api';
import BookCard from './BookCard';
import { BookShelfEntity, BookShelfResponse } from '../interfaces/books';
import { bookProgress, bookRouteId, cleanBookTitle } from '../utils/helpers';
import UpNext from './UpNext';
import { useUpNext } from '../hooks/useUpNext';

interface DashboardProps {
  onLogout: () => void;
  onOpenSettings: () => void;
  triggerLogout?: boolean;
  setTriggerLogout?: (value: boolean) => void;
}

// The library as last loaded, and where it was scrolled, kept for the app's
// lifetime: coming back from the player shows it at once (refreshed quietly in
// the background) instead of a loading spinner, at the same scroll position.
let cachedBooks: BookShelfEntity[] | null = null;
let savedScrollTop = 0;

export function Dashboard({ onLogout, onOpenSettings }: DashboardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [books, setBooks] = useState<BookShelfEntity[]>(() => cachedBooks ?? []);
  const starredIds = useUpNext();
  const showUpNext = starredIds.some((id) => {
    const entry = books.find((book) => bookRouteId(book) === id);
    return !!entry && !bookProgress(entry).isFinished;
  });
  const [isLoading, setIsLoading] = useState(cachedBooks === null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Back at the same place in the list; the position is saved when leaving.
  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    scroller.scrollTop = savedScrollTop;
    return () => {
      savedScrollTop = scroller.scrollTop;
    };
  }, []);
  const [error, setError] = useState('');
  const [filterStatus, setFilterStatus] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

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
      // A spinner only when there is nothing to show yet.
      if (cachedBooks === null) setIsLoading(true);
      const response = await api.get<BookShelfResponse>('/bookshelf');
      cachedBooks = response.data.books || [];
      setBooks(cachedBooks);
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

    // Like a bookcase: by the first author's surname, then title, then part ("1 of 2" before "2 of 2").
    const sortKey = (book: BookShelfEntity) => {
      const firstAuthor = (book.book?.authorsAsString || '').split(',')[0].trim();
      const { title, part } = cleanBookTitle(book.book?.name || '');
      return { surname: firstAuthor.split(' ').pop() || '', firstAuthor, title, part: part?.n ?? 0 };
    };
    const compare = (x: string, y: string) => x.localeCompare(y, undefined, { sensitivity: 'base', numeric: true });
    result.sort((a, b) => {
      const ka = sortKey(a);
      const kb = sortKey(b);
      return compare(ka.surname, kb.surname) || compare(ka.firstAuthor, kb.firstAuthor)
        || compare(ka.title, kb.title) || ka.part - kb.part;
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

  const focusRing =
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF5100]';
  const secondaryButton = `h-9 px-3 rounded-[10px] bg-white/[0.06] hover:bg-white/10 text-[#D1D5DB] text-[13px] font-medium transition-colors ${focusRing}`;

  let body: React.ReactNode;
  if (isLoading) {
    body = (
      <div role="status" className="h-full flex flex-col items-center justify-center gap-3 text-[13px] text-[#9CA3AF] animate-fade-in">
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
        <p className="text-[13px] text-[#9CA3AF]">
          {t('dashboard.emptyLibrary', 'Your library appears to be empty.')}
        </p>
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
    const grid = (
      <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-7">
        {filteredBooks
          .filter((book) => !!book?.abook || !!book?.book)
          .map((book) => (
            <BookCard
              key={book.abook?.id || book.id || book.book?.consumableId}
              book={book}
              onBookSelect={handleBookSelect}
              onQuickPlay={handleQuickPlay}
            />
          ))}
      </div>
    );
    // With starred books still to finish: "Up next" above, then a "Library" title.
    body = showUpNext ? (
      <div className="max-w-[1000px] mx-auto pt-3">
        <UpNext books={books} />
        <h2 className="mt-12 mb-4 font-serif text-[21px] font-semibold tracking-[-0.012em] leading-[1.2] text-white/[0.92]">
          {t('upNext.library')}
        </h2>
        {grid}
      </div>
    ) : (
      <div className="max-w-[1000px] mx-auto">{grid}</div>
    );
  }

  return (
    <div className="relative flex-1 min-h-0 flex flex-col bg-[#0A0A0A] text-white selection:bg-[#FF5100] selection:text-white">
      {/* A plain player: no title, filters or search, only the settings cog. It floats
          over the page (no bar), so the library scrolls up under it, as in Read along. */}
      <header className="absolute top-0 right-0 z-20 px-3 pt-2">
        <button
          type="button"
          onClick={onOpenSettings}
          aria-label={t('settings.title', 'Settings')}
          title={t('settings.title', 'Settings')}
          className={`w-9 h-9 rounded-[10px] flex items-center justify-center text-[#9CA3AF] hover:text-white hover:bg-white/[0.06] transition-colors ${focusRing}`}
        >
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" />
          </svg>
        </button>
      </header>

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-10 pt-[84px] pb-[calc(3rem+var(--player-bar-h,0px))]">{body}</div>
    </div>
  );
}

export default Dashboard;
