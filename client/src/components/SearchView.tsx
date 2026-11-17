import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../utils/api';
import { SearchResultBook, SearchResponse } from '../interfaces/books';
import { addToBookshelfErrorKey, localizedLanguageName, searchResultToBookEntity } from '../utils/helpers';
import SearchFilterRail, { DurationFilter, LanguageStat } from './SearchFilterRail';
import SearchResultList, { SortOption } from './SearchResultList';
import SearchPreviewPane from './SearchPreviewPane';

const focusRing =
  'focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF5100]';

interface SearchViewProps {
  query?: string;
}

export function SearchView({ query: propQuery }: SearchViewProps) {
  const { t, i18n } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const searchInputRef = useRef<HTMLInputElement>(null);

  const activeQuery = propQuery !== undefined ? propQuery : (searchParams.get('q') || '');

  // Local input value, kept in sync with the active query (URL or prop)
  const [inputValue, setInputValue] = useState(activeQuery);
  useEffect(() => {
    setInputValue(activeQuery);
  }, [activeQuery]);

  // Autofocus the search box when the page opens
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  // Cmd+K / Ctrl+K while already on this page: focus the search box.
  // Navigation to /search from other pages is handled by the app layout.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputValue(val);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (val) next.set('q', val);
        else next.delete('q');
        return next;
      },
      { replace: true }
    );
  };

  const [rawResults, setRawResults] = useState<SearchResultBook[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedBook, setSelectedBook] = useState<SearchResultBook | null>(null);

  // Filters state
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]); // empty = all
  const [selectedDuration, setSelectedDuration] = useState<DurationFilter>('all');
  const [sortBy, setSortBy] = useState<SortOption>('relevance');

  // Book actions state
  const [addedBooks, setAddedBooks] = useState<Record<string, boolean>>({});
  const [addingBookId, setAddingBookId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Perform backend search
  const performSearch = async (searchTerm: string) => {
    const q = searchTerm.trim();
    if (!q) {
      setRawResults([]);
      setSelectedBook(null);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const res = await api.get<SearchResponse>(`/search?q=${encodeURIComponent(q)}`);
      const results = res.data?.results || [];
      setRawResults(results);
      if (results.length > 0) {
        setSelectedBook(results[0]);
      } else {
        setSelectedBook(null);
      }
    } catch (err) {
      console.error('Catalog search failed:', err);
      setRawResults([]);
      setSelectedBook(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (!activeQuery.trim()) {
      setRawResults([]);
      setSelectedBook(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    debounceTimerRef.current = setTimeout(() => {
      performSearch(activeQuery);
    }, 250);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [activeQuery]);

  // Compute language breakdown stats
  const languageStats = useMemo<LanguageStat[]>(() => {
    const counts: Record<string, { iso: string; name: string; count: number }> = {};
    for (const book of rawResults) {
      if (!book.language) continue;
      const iso = book.language.toLowerCase();
      const name = localizedLanguageName(iso, i18n.language, book.languageName) || iso.toUpperCase();
      if (!counts[iso]) {
        counts[iso] = { iso, name, count: 0 };
      }
      counts[iso].count += 1;
    }
    return Object.values(counts);
  }, [rawResults, i18n.language]);

  // Filter and sort results
  const filteredResults = useMemo(() => {
    let list = [...rawResults];

    // 1. Language Filter
    if (selectedLanguages.length > 0) {
      list = list.filter((b) => selectedLanguages.includes((b.language || '').toLowerCase()));
    }

    // 2. Duration Filter
    if (selectedDuration === 'under5') {
      list = list.filter((b) => b.durationMs > 0 && b.durationMs < 5 * 3600 * 1000);
    } else if (selectedDuration === '5to15') {
      list = list.filter(
        (b) => b.durationMs >= 5 * 3600 * 1000 && b.durationMs <= 15 * 3600 * 1000
      );
    } else if (selectedDuration === 'over15') {
      list = list.filter((b) => b.durationMs > 15 * 3600 * 1000);
    }

    // 3. Sort
    if (sortBy === 'title') {
      list.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    } else if (sortBy === 'duration') {
      list.sort((a, b) => b.durationMs - a.durationMs);
    }

    return list;
  }, [rawResults, selectedLanguages, selectedDuration, sortBy]);

  // Keep selectedBook valid after filter changes
  useEffect(() => {
    if (filteredResults.length > 0) {
      if (!selectedBook || !filteredResults.some((b) => b.id === selectedBook.id)) {
        setSelectedBook(filteredResults[0]);
      }
    } else {
      setSelectedBook(null);
    }
  }, [filteredResults, selectedBook]);

  const handleToggleLanguage = (iso: string) => {
    const code = iso.toLowerCase();
    setSelectedLanguages((prev) => {
      if (prev.includes(code)) {
        return prev.filter((c) => c !== code);
      } else {
        return [...prev, code];
      }
    });
  };

  const handlePlayBook = (e: React.MouseEvent | null, bookId: string) => {
    if (e) e.stopPropagation();
    const targetBook = rawResults.find((b) => b.id === bookId) || (selectedBook?.id === bookId ? selectedBook : null);
    const entity = targetBook ? searchResultToBookEntity(targetBook) : null;
    navigate(`/player/${bookId}`, { state: { book: entity, autoPlay: true } });
  };

  const handleAddToLibrary = async (e: React.MouseEvent | null, bookId: string) => {
    if (e) e.stopPropagation();
    if (addedBooks[bookId] || addingBookId === bookId) return;

    try {
      setAddingBookId(bookId);
      await api.post('/bookshelf/add', { consumableId: bookId });
      setAddedBooks((prev) => ({ ...prev, [bookId]: true }));
      window.dispatchEvent(new Event('bookshelfUpdated'));
      setToastMessage({
        type: 'success',
        text: t('search.addedToBookshelf', 'Added to Library'),
      });
      setTimeout(() => setToastMessage(null), 3000);
    } catch (err: any) {
      console.error('Failed to add book to library:', err);
      setToastMessage({
        type: 'error',
        text: t(addToBookshelfErrorKey(err)),
      });
      setTimeout(() => setToastMessage(null), 4500);
    } finally {
      setAddingBookId(null);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#0A0A0A] text-white overflow-hidden relative select-none">
      {/* Toast feedback banner */}
      {toastMessage && (
        <div
          className={`absolute top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl text-xs font-medium flex items-center gap-2 shadow-2xl backdrop-blur-md transition-all animate-in fade-in slide-in-from-top-2 ${
            toastMessage.type === 'success'
              ? 'bg-green-950/95 text-green-300 border border-green-700/50'
              : 'bg-red-950/95 text-red-300 border border-red-700/50'
          }`}
        >
          {toastMessage.type === 'success' ? (
            <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Header row: back button + centred search box */}
      <div className="titlebar-inset flex items-center gap-3 px-3 py-2 flex-shrink-0">
        <button
          type="button"
          onClick={() => navigate('/')}
          aria-label={t('common.back', 'Back')}
          className={`w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-[10px] text-[#9CA3AF] hover:text-white hover:bg-white/[0.06] transition-colors ${focusRing}`}
        >
          <svg aria-hidden="true" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <label className="flex-1 max-w-[640px] mx-auto relative flex items-center">
          <span className="sr-only">{t('search.title', 'Search Storytel')}</span>
          <svg aria-hidden="true" className="w-4 h-4 absolute left-3.5 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth={2} strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <input
            ref={searchInputRef}
            type="search"
            value={inputValue}
            onChange={handleQueryChange}
            placeholder={t('search.placeholder', 'Search by title, author, or narrator...')}
            className="w-full h-11 pl-10 pr-3.5 rounded-[12px] bg-[#121214] border border-white/[0.14] text-white text-sm placeholder-[#9CA3AF] outline-none focus:border-[#FF5100]/60 transition-colors"
          />
        </label>
        <span className="w-11 flex-shrink-0" aria-hidden="true" />
      </div>

      {/* Three columns (wrap on narrow windows) */}
      <div className="flex-1 min-h-0 flex flex-wrap overflow-y-auto custom-scrollbar">
      {/* 1. Left: Filter Rail (188px) */}
      <SearchFilterRail
        languageStats={languageStats}
        selectedLanguages={selectedLanguages}
        onToggleLanguage={handleToggleLanguage}
        onSelectAllLanguages={() => setSelectedLanguages([])}
        selectedDuration={selectedDuration}
        onChangeDuration={setSelectedDuration}
        totalHits={rawResults.length}
      />

      {/* 2. Center: Results, between two vertical dividers */}
      <section
        aria-label={t('search.results', 'Search results')}
        className="flex-[1_1_380px] min-w-0 min-h-0 max-h-full flex flex-col border-x border-white/[0.06]"
      >
        {isLoading && rawResults.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="w-7 h-7 border-2 border-[#FF5100] border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-[13px] text-[#9CA3AF]">{t('search.searching', 'Searching...')}</p>
          </div>
        ) : !activeQuery.trim() ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <svg aria-hidden="true" className="w-7 h-7 text-[#9CA3AF] mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
            <h3 className="text-[15px] font-semibold text-white mb-1">{t('search.title', 'Search Storytel')}</h3>
            <p className="text-[13px] text-[#9CA3AF] max-w-sm">
              {t('search.initialPrompt', "Type to search Storytel's vast catalog of audiobooks")}
            </p>
          </div>
        ) : rawResults.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <h3 className="text-[15px] font-semibold text-white mb-1 break-words max-w-full">
              {t('search.noResults', 'No books found for')} ”{activeQuery}”
            </h3>
            <p className="text-[13px] text-[#9CA3AF] max-w-sm">
              {t('search.noResultsHint', 'Check the spelling or try another search term')}
            </p>
          </div>
        ) : filteredResults.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <h3 className="text-[15px] font-semibold text-white mb-3">{t('search.noFilterMatch', 'No matches with the selected filters')}</h3>
            <button
              type="button"
              onClick={() => {
                setSelectedLanguages([]);
                setSelectedDuration('all');
              }}
              className={`h-9 px-3.5 rounded-[10px] bg-white/[0.06] hover:bg-white/10 text-[#D1D5DB] text-[13px] transition-colors ${focusRing}`}
            >
              {t('search.showAllLanguages', { total: rawResults.length })}
            </button>
          </div>
        ) : (
          <SearchResultList
            results={filteredResults}
            totalRawHits={rawResults.length}
            selectedBookId={selectedBook?.id || null}
            onSelectBook={(book) => setSelectedBook(book)}
            onPlayBook={(e, id) => handlePlayBook(e, id)}
            onAddToLibrary={(e, id) => handleAddToLibrary(e, id)}
            addedBooks={addedBooks}
            addingBookId={addingBookId}
            sortBy={sortBy}
            onChangeSort={setSortBy}
          />
        )}
      </section>

      {/* 3. Right: Preview Pane (340px) */}
      <SearchPreviewPane
        book={selectedBook}
        onPlay={(id) => handlePlayBook(null, id)}
        onAddToLibrary={(id) => handleAddToLibrary(null, id)}
        isAdded={selectedBook ? !!addedBooks[selectedBook.id] : false}
        isAdding={selectedBook ? addingBookId === selectedBook.id : false}
      />
      </div>
    </div>
  );
}

export default SearchView;
