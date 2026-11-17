import React from 'react';
import { useTranslation } from 'react-i18next';
import { SearchResultBook } from '../interfaces/books';
import { buildCoverUrl, formatMicrosecondsTime } from '../utils/helpers';

export type SortOption = 'relevance' | 'title' | 'duration';

interface SearchResultListProps {
  results: SearchResultBook[];
  totalRawHits: number;
  selectedBookId: string | null;
  onSelectBook: (book: SearchResultBook) => void;
  onPlayBook: (e: React.MouseEvent, bookId: string) => void;
  onAddToLibrary: (e: React.MouseEvent, bookId: string) => void;
  addedBooks: Record<string, boolean>;
  addingBookId: string | null;
  sortBy: SortOption;
  onChangeSort: (sort: SortOption) => void;
}

export function SearchResultList({
  results,
  totalRawHits,
  selectedBookId,
  onSelectBook,
  onPlayBook,
  onAddToLibrary,
  addedBooks,
  addingBookId,
  sortBy,
  onChangeSort,
}: SearchResultListProps) {
  const { t } = useTranslation();

  const focusRing =
    'focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF5100]';

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* 1. Header line: hit count + sort */}
      <div className="flex items-center gap-3 px-4 py-3 flex-shrink-0 select-none">
        <span className="flex-1 text-[13px] text-[#9CA3AF]">
          {results.length === totalRawHits
            ? t('search.hitCount', { count: results.length })
            : t('search.hitCountFiltered', { count: results.length, total: totalRawHits })}
        </span>

        <label className="flex items-center gap-1.5 text-xs text-[#9CA3AF]">
          {t('search.sortLabel', 'Sort:')}
          <span className="relative inline-flex items-center">
            <select
              value={sortBy}
              onChange={(e) => onChangeSort(e.target.value as SortOption)}
              className={`appearance-none h-[30px] pl-2.5 pr-[30px] rounded-[8px] bg-[#121214] border border-white/[0.12] text-xs text-[#E5E7EB] ${focusRing}`}
            >
              <option value="relevance">{t('search.sortRelevance', 'Most relevant')}</option>
              <option value="title">{t('search.sortTitle', 'Title (A–Z)')}</option>
              <option value="duration">{t('search.sortDuration', 'Longest first')}</option>
            </select>
            <svg
              aria-hidden="true"
              className="absolute right-2.5 w-3 h-3 pointer-events-none"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#9CA3AF"
              strokeWidth={2.4}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </span>
        </label>
      </div>

      {/* 2. Scrollable rows */}
      <ul className="flex-1 min-h-0 overflow-y-auto px-2 pb-4 m-0 list-none custom-scrollbar">
        {results.map((book) => {
          const isSelected = selectedBookId === book.id;
          const isAdded = addedBooks[book.id];
          const isAdding = addingBookId === book.id;
          const durationText =
            book.durationMs > 0
              ? formatMicrosecondsTime(book.durationMs * 1000, {
                  hours: t('search.hours'),
                  minutes: t('search.minutes'),
                })
              : '';
          const formats = [
            book.hasAbook ? t('search.audiobook', 'Audiobook') : '',
            book.hasEbook ? t('search.ebook', 'E-book') : '',
          ]
            .filter(Boolean)
            .join(', ');
          const meta = [book.authors, formats, durationText].filter(Boolean).join(' · ');
          const addLabel = isAdded
            ? t('search.addedToBookshelf', 'Added to Library')
            : t('search.addToBookshelf', 'Add to Library');

          return (
            <li
              key={book.id}
              onClick={() => onSelectBook(book)}
              className={`group flex items-center gap-1 p-2 rounded-[10px] cursor-pointer select-none transition-colors ${
                isSelected ? 'bg-white/[0.06]' : 'bg-transparent hover:bg-white/[0.03]'
              }`}
            >
              {/* Selects the row; keyboard-accessible */}
              <button
                type="button"
                aria-pressed={isSelected}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectBook(book);
                }}
                className={`flex-1 min-w-0 flex items-center gap-3 text-left rounded-[8px] ${focusRing}`}
              >
                <span className="w-11 h-11 rounded-[8px] bg-[#121214] overflow-hidden flex-shrink-0 flex items-center justify-center text-[#9CA3AF]">
                  {book.coverUrl ? (
                    <img
                      src={buildCoverUrl(book.coverUrl)}
                      alt=""
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <svg aria-hidden="true" className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                  )}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] font-semibold text-white truncate">{book.title}</span>
                  {meta && <span className="block text-xs text-[#9CA3AF] mt-0.5 truncate">{meta}</span>}
                </span>
              </button>

              {/* Play (kept from the previous design) */}
              <button
                type="button"
                onClick={(e) => onPlayBook(e, book.id)}
                aria-label={t('search.play', 'Play')}
                title={t('search.play', 'Play')}
                className={`w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-[10px] text-[#9CA3AF] hover:text-white hover:bg-white/[0.06] transition-colors ${focusRing}`}
              >
                <svg aria-hidden="true" className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M9 6.8v10.4a1 1 0 001.5.86l8.3-5.2a1 1 0 000-1.72l-8.3-5.2A1 1 0 009 6.8z" />
                </svg>
              </button>

              {/* Add / In Library */}
              <button
                type="button"
                onClick={(e) => onAddToLibrary(e, book.id)}
                aria-label={addLabel}
                title={addLabel}
                aria-busy={isAdding || undefined}
                disabled={isAdded || isAdding}
                className={`w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-[10px] transition-colors ${focusRing} ${
                  isAdded
                    ? 'text-[#FF7A3D] cursor-default'
                    : isAdding
                    ? 'text-[#9CA3AF]'
                    : 'text-[#9CA3AF] hover:text-white hover:bg-white/[0.06]'
                }`}
              >
                {isAdded ? (
                  <svg aria-hidden="true" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12l5 5 9-10" />
                  </svg>
                ) : isAdding ? (
                  <svg aria-hidden="true" className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                ) : (
                  <svg aria-hidden="true" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default SearchResultList;
