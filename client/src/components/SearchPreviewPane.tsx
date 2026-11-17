import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SearchResultBook } from '../interfaces/books';
import { buildCoverUrl, formatMicrosecondsTime, localizedLanguageName } from '../utils/helpers';

interface SearchPreviewPaneProps {
  book: SearchResultBook | null;
  onPlay: (bookId: string) => void;
  onAddToLibrary: (bookId: string) => void;
  isAdded: boolean;
  isAdding: boolean;
}

export function SearchPreviewPane({
  book,
  onPlay,
  onAddToLibrary,
  isAdded,
  isAdding,
}: SearchPreviewPaneProps) {
  const { t, i18n } = useTranslation();

  const asideClass =
    'flex-[0_1_340px] min-w-0 max-h-full box-border p-6 flex flex-col gap-3.5 overflow-y-auto custom-scrollbar select-none';

  if (!book) {
    return (
      <aside aria-label={t('search.preview', 'Preview')} className={`${asideClass} items-center justify-center text-center`}>
        <svg aria-hidden="true" className="w-7 h-7 text-[#9CA3AF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
        <p className="m-0 text-[13px] text-[#9CA3AF]">{t('search.selectBookHint', 'Select a book to preview')}</p>
      </aside>
    );
  }

  const durationText =
    book.durationMs > 0
      ? formatMicrosecondsTime(book.durationMs * 1000, {
          hours: t('search.hours'),
          minutes: t('search.minutes'),
        })
      : '';
  const languageLabel = book.language
    ? localizedLanguageName(book.language, i18n.language, book.languageName)
    : (book.languageName ? (book.languageName.charAt(0).toUpperCase() + book.languageName.slice(1)) : '');
  const formats = [
    book.hasAbook ? t('search.audiobook', 'Audiobook') : '',
    book.hasEbook ? t('search.ebook', 'E-book') : '',
  ]
    .filter(Boolean)
    .join(', ');
  const meta = [formats, durationText, languageLabel].filter(Boolean).join(' · ');
  const addLabel = isAdded ? t('bookView.inLibrary', 'In Library') : t('bookView.addToLibrary', 'Add to Library');

  const focusRing =
    'focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF5100]';

  return (
    <aside aria-label={t('search.preview', 'Preview')} className={asideClass}>
      {/* Cover (160x160) */}
      <div className="w-40 h-40 rounded-[12px] overflow-hidden bg-[#121214] flex-shrink-0 flex items-center justify-center text-[#9CA3AF]">
        {book.coverUrl ? (
          <img src={buildCoverUrl(book.coverUrl)} alt="" className="w-full h-full object-cover" />
        ) : (
          <svg aria-hidden="true" className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
        )}
      </div>

      {/* Title, author, meta */}
      <div>
        <h2 className="m-0 text-base font-semibold leading-[1.3] text-white">{book.title}</h2>
        {book.authors && <p className="mt-1 mb-0 text-[13px] text-[#D1D5DB]">{book.authors}</p>}
        {meta && <p className="mt-1.5 mb-0 text-xs text-[#9CA3AF]">{meta}</p>}
      </div>

      {/* Actions: Listen, Details, Add */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPlay(book.id)}
          className={`h-9 px-3.5 rounded-[10px] bg-[#FF5100] hover:brightness-110 text-white text-[13px] font-semibold flex items-center gap-1.5 transition-all ${focusRing}`}
        >
          <svg aria-hidden="true" className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
            <path d="M9 6.8v10.4a1 1 0 001.5.86l8.3-5.2a1 1 0 000-1.72l-8.3-5.2A1 1 0 009 6.8z" />
          </svg>
          <span>{t('bookView.listen', 'Listen')}</span>
        </button>
        <Link
          to={`/book/${book.id}`}
          className={`h-9 px-3 rounded-[10px] border border-white/[0.14] text-[#D1D5DB] hover:text-white hover:bg-white/[0.04] text-[13px] flex items-center no-underline transition-colors ${focusRing}`}
        >
          {t('search.details', 'Details')}
        </Link>
        {/* Add to library (kept from the previous design) */}
        <button
          type="button"
          onClick={() => onAddToLibrary(book.id)}
          disabled={isAdded || isAdding}
          aria-label={addLabel}
          title={addLabel}
          aria-busy={isAdding || undefined}
          className={`w-9 h-9 rounded-[10px] border border-white/[0.14] flex items-center justify-center transition-colors ${focusRing} ${
            isAdded
              ? 'text-[#FF7A3D] cursor-default'
              : 'text-[#D1D5DB] hover:text-white hover:bg-white/[0.04]'
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
      </div>

      {/* Description */}
      {book.description && (
        <p className="m-0 text-[13px] leading-[1.6] text-[#D1D5DB] line-clamp-6 text-pretty">{book.description}</p>
      )}
    </aside>
  );
}

export default SearchPreviewPane;
