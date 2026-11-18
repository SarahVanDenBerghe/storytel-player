import React from 'react';
import { useTranslation } from 'react-i18next';
import { bookCoverOf, bookProgress, bookRouteId, buildCoverUrl, cleanBookTitle } from '../utils/helpers';
import { upNext, useUpNext } from '../hooks/useUpNext';
import { BookShelfEntity } from '../interfaces/books';

interface BookCardProps {
  book: BookShelfEntity;
  onBookSelect: (book: BookShelfEntity) => void;
  onQuickPlay?: (e: React.MouseEvent, book: BookShelfEntity) => void;
}

const focusRing = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF5100]';

export function BookCard({ book, onBookSelect, onQuickPlay }: BookCardProps) {
  const { t } = useTranslation();

  const { percent: progressPercent, isFinished, isStarted } = bookProgress(book);
  const coverUrl = bookCoverOf(book);
  const routeId = bookRouteId(book);
  const starred = useUpNext().includes(routeId);

  const rawTitle = book?.book?.name || '';
  const { title } = cleanBookTitle(rawTitle);

  const percent = Math.round(progressPercent);
  // Total length as h:mm (abook.time is in microseconds).
  const totalMinutes = Math.round((book.abook?.time || 0) / 60_000_000);
  const totalLength = totalMinutes > 0
    ? `${Math.floor(totalMinutes / 60)}:${String(totalMinutes % 60).padStart(2, '0')}`
    : '';
  const coverLabel = isFinished
    ? t('bookCard.coverLabelFinished', { title, defaultValue: 'Cover of {{title}}, finished' })
    : isStarted
    ? t('bookCard.coverLabelStarted', { title, percent, defaultValue: 'Cover of {{title}}, {{percent}}% listened' })
    : t('bookCard.coverLabel', { title, defaultValue: 'Cover of {{title}}' });

  return (
    <div className="group relative min-w-0 select-none">
      <button
        type="button"
        onClick={() => onBookSelect(book)}
        className={`w-full min-w-0 flex flex-col text-left rounded-[6px] ${focusRing}`}
      >
        {/* The cover with its own title and author (logos tidied away) is the whole card: no caption below.
            Only the progress line is drawn on it; controls appear on hover. */}
        <div
          role="img"
          aria-label={coverLabel}
          title={rawTitle}
          className="relative aspect-square w-full overflow-hidden rounded-[6px] bg-[#121214] cover-border flex items-center justify-center transition-[transform,box-shadow] duration-200 ease-out group-hover:-translate-y-0.5 group-hover:shadow-[0_10px_28px_rgba(0,0,0,0.5)]"
        >
          {coverUrl ? (
            <img
              src={buildCoverUrl(coverUrl, 'tidy')}
              alt=""
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <svg aria-hidden="true" className="w-10 h-10 text-[#9CA3AF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          )}

          {/* Total length: a frosted pill, bottom centre, on hover only. */}
          {totalLength && (
            <span
              aria-hidden="true"
              className="absolute bottom-3 left-1/2 -translate-x-1/2 translate-y-1 whitespace-nowrap rounded-full border border-white/15 bg-black/35 px-2.5 py-1 text-[11px] font-medium leading-none tabular-nums text-white/95 shadow-[0_2px_10px_rgba(0,0,0,0.35)] backdrop-blur-md opacity-0 group-hover:opacity-100 group-hover:translate-y-0 transition-[opacity,transform] duration-200 ease-out pointer-events-none"
            >
              {totalLength}
            </span>
          )}

          {isStarted && (
            <div className="absolute inset-x-0 bottom-0 h-1 bg-black/55">
              <div className="h-1 bg-[#FF5100]" style={{ width: `${progressPercent}%` }} />
            </div>
          )}

        </div>

      </button>

      {/* Hover actions, layered over the cover (siblings of the main button, never nested) */}
      {onQuickPlay && (
        <div className="absolute inset-x-0 top-0 aspect-square flex items-center justify-center pointer-events-none">
          <button
            type="button"
            onClick={(e) => onQuickPlay(e, book)}
            aria-label={t('search.play', 'Play')}
            title={t('search.play', 'Play')}
            className={`pointer-events-auto w-10 h-10 rounded-full bg-[#FF5100] text-white flex items-center justify-center shadow-lg opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100 focus-visible:opacity-100 focus-visible:scale-100 transition-[opacity,transform] duration-200 ease-out ${focusRing}`}
          >
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M9 6.8v10.4a1 1 0 001.5.86l8.3-5.2a1 1 0 000-1.72l-8.3-5.2A1 1 0 009 6.8z" />
            </svg>
          </button>
        </div>
      )}

      {/* Up next: a star on hover only, like every control on the cover; filled when starred. */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          upNext.toggle(routeId);
        }}
        aria-pressed={starred}
        aria-label={starred ? t('upNext.removeStar') : t('upNext.addStar')}
        title={starred ? t('upNext.removeStar') : t('upNext.addStar')}
        className={`absolute top-2 right-2 w-7 h-7 rounded-full bg-[#0A0A0A]/75 flex items-center justify-center opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-[opacity,transform,color,background-color] duration-200 ease-out group-hover:-translate-y-0.5 ${
          starred ? 'text-[#FF7A3D]' : 'text-white hover:text-[#FF7A3D]'
        } hover:bg-[#0A0A0A]/95 hover:scale-110 ${focusRing}`}
      >
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill={starred ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} strokeLinejoin="round">
          <path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z" />
        </svg>
      </button>

    </div>
  );
}

export default BookCard;
