import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAudioContext } from '../contexts/AudioContext';
import { buildCoverUrl, cleanBookTitle, formatTime } from '../utils/helpers';
import { SKIP_BACKWARD_SECONDS, SKIP_FORWARD_SECONDS } from '../config/player';
import SkipIcon from './SkipIcon';
import PlayerTools from './PlayerTools';

/**
 * The footer, mounted once for every page. "full": cover, transport and tools.
 * "tools" (the full player, which has its own transport): only the tools, in
 * the same place, on a transparent bar.
 */
export function PlayerBar({ variant = 'full' }: { variant?: 'full' | 'tools' }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    activeBook,
    activeBookId,
    isPlaying,
    isLoading,
    currentTime,
    duration,
    currentChapter,
    togglePlayPause,
    seek,
    skipForward,
    skipBackward,
  } = useAudioContext();

  if (!activeBook && !activeBookId) {
    return null;
  }

  const toolsOnly = variant === 'tools';
  // Hidden parts stay in the layout, so the tools keep their place between modes.
  const fadeOut = `transition-[opacity,visibility] duration-150 ${toolsOnly ? 'opacity-0 invisible' : 'opacity-100 visible'}`;

  const fullTitle = activeBook?.book?.name || `Storytel ${t('search.audiobook')}`;
  // Short title, as in the library ("Golden Son"); the part goes on the second line.
  const { title: shortTitle, part } = cleanBookTitle(fullTitle);
  const bookTitle = shortTitle || fullTitle;
  const partLabel = part ? t('bookCard.part', { n: part.n, total: part.total }) : '';
  const authorName = activeBook?.book?.authorsAsString || activeBook?.abook?.narratorAsString || '';
  const coverUrl = activeBook?.book?.largeCover || activeBook?.book?.largeCoverE || '';
  const progressPercent = duration > 0 ? Math.min(Math.max((currentTime / duration) * 100, 0), 100) : 0;
  const remainingSeconds = Math.max(0, duration - currentTime);

  const handleScrubberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    seek(newTime);
  };

  const handleOpenFullPlayer = () => {
    if (activeBookId) {
      navigate(`/player/${activeBookId}`);
    }
  };

  const focusRing = 'focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF5100]';
  const skipClass = `h-8 w-9 flex items-center justify-center rounded-[8px] bg-transparent text-[#D1D5DB] hover:text-[#FF5100] transition-colors ${focusRing}`;

  return (
    // Overlays the page (see AuthenticatedLayout), so the library scrolls behind its glass.
    <div className="absolute bottom-0 inset-x-0 h-[76px] px-5 gap-5 flex items-center z-40 select-none">
      {/* The glass, bump included, and the top line sit on their own layers: on the
          bar itself the glass would stop the bar's menus (speed, volume…) from
          blurring what is behind them. Shapes: .player-bar-glass in index.css. */}
      <div aria-hidden="true" className={`player-bar-glass absolute inset-x-0 bottom-0 -top-[23px] -z-10 pointer-events-none bg-[#121214]/80 backdrop-blur-xl backdrop-saturate-150 transition-opacity duration-150 ${toolsOnly ? 'opacity-0' : ''}`} />
      <div aria-hidden="true" className={`player-bar-line absolute inset-x-0 top-0 h-px pointer-events-none bg-white/[0.08] transition-opacity duration-150 ${toolsOnly ? 'opacity-0' : ''}`} />
      {/* 1. Left: cover, title, author · chapter */}
      <div aria-hidden={toolsOnly || undefined} className={`flex-[0_1_260px] min-w-0 flex items-center gap-3 ${fadeOut}`}>
        <button
          type="button"
          onClick={handleOpenFullPlayer}
          aria-label={t('player.expand', 'Open full player')}
          className={`w-[52px] h-[52px] rounded-[5px] bg-[#141416] cover-border overflow-hidden flex-shrink-0 ${focusRing}`}
        >
          {coverUrl ? (
            <img src={buildCoverUrl(coverUrl)} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="w-full h-full flex items-center justify-center text-[#9CA3AF]">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </span>
          )}
        </button>

        <div className="min-w-0">
          <button
            type="button"
            onClick={handleOpenFullPlayer}
            title={fullTitle}
            className={`block max-w-full text-left text-[14px] font-semibold text-white truncate hover:text-[#FF7A3D] transition-colors rounded ${focusRing}`}
          >
            {bookTitle}
          </button>
          {(authorName || partLabel || currentChapter) && (
            <div
              className="text-[12px] text-[#9CA3AF] truncate mt-0.5"
              title={[authorName, partLabel, currentChapter?.title].filter(Boolean).join(' · ')}
            >
              {[authorName, partLabel, currentChapter?.title].filter(Boolean).join(' · ')}
            </div>
          )}
        </div>
      </div>

      {/* 2. Centre: transport row + scrubber */}
      <div aria-hidden={toolsOnly || undefined} className={`relative self-stretch flex-[1_1_360px] min-w-0 max-w-[560px] mx-auto flex flex-col items-center gap-3 ${fadeOut}`}>
        {/* The bump: the bar rises in one soft curve behind the play button, so the
            flat part keeps its height. Its glass is part of .player-bar-glass; this
            draws the top line along the curve (the bar's own line skips it). */}
        <svg aria-hidden="true" width="260" height="23" viewBox="0 0 260 23" className="absolute bottom-full left-1/2 -translate-x-1/2 pointer-events-none">
          <path d="M0 22.5C60 22.5 74 0.5 130 0.5S200 22.5 260 22.5" fill="none" stroke="rgba(255,255,255,0.08)" />
        </svg>
        <div className="relative flex items-center gap-[14px] -mt-2">
          <button
            type="button"
            onClick={() => skipBackward(SKIP_BACKWARD_SECONDS)}
            aria-label={t('player.skipBackward', { seconds: SKIP_BACKWARD_SECONDS })}
            title={t('player.skipBackward', { seconds: SKIP_BACKWARD_SECONDS })}
            className={skipClass}
          >
            <SkipIcon direction="backward" size={20} />
          </button>

          <button
            type="button"
            onClick={togglePlayPause}
            disabled={isLoading}
            aria-label={isPlaying ? t('tray.pause', 'Pause') : t('tray.play', 'Play')}
            className={`w-10 h-10 rounded-full bg-[#FF5100] hover:bg-[#FF6A26] text-white flex items-center justify-center transition-colors disabled:cursor-wait ${focusRing}`}
          >
            {isLoading ? (
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            ) : isPlaying ? (
              <svg className="w-[18px] h-[18px]" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <rect x="6.5" y="5" width="3.5" height="14" rx="1.25" />
                <rect x="14" y="5" width="3.5" height="14" rx="1.25" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M9 6.8v10.4a1 1 0 001.5.86l8.3-5.2a1 1 0 000-1.72l-8.3-5.2A1 1 0 009 6.8z" />
              </svg>
            )}
          </button>

          <button
            type="button"
            onClick={() => skipForward(SKIP_FORWARD_SECONDS)}
            aria-label={t('player.skipForward', { seconds: SKIP_FORWARD_SECONDS })}
            title={t('player.skipForward', { seconds: SKIP_FORWARD_SECONDS })}
            className={skipClass}
          >
            <SkipIcon direction="forward" size={20} />
          </button>
        </div>

        <div className="w-full flex items-center gap-2.5 text-[11px] text-[#9CA3AF] tabular-nums">
          <span className="min-w-[46px] text-right">{formatTime(currentTime)}</span>

          <div className="flex-1 relative flex items-center py-1 rounded [&:has(:focus-visible)]:outline [&:has(:focus-visible)]:outline-2 [&:has(:focus-visible)]:outline-offset-2 [&:has(:focus-visible)]:outline-[#FF5100]">
            <div className="w-full h-1 bg-white/[0.12] rounded-full overflow-hidden">
              <div className={`h-full bg-[#FF5100] rounded-full transition-[width] duration-300 ease-linear ${isPlaying ? 'progress-live' : ''}`} style={{ width: `${progressPercent}%` }} />
            </div>
            <input
              type="range"
              min={0}
              max={duration || 100}
              step={0.5}
              value={currentTime}
              onChange={handleScrubberChange}
              aria-label={t('player.seekPosition', 'Playback position')}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
          </div>

          <span className="min-w-[52px] text-left">−{formatTime(remainingSeconds)}</span>
        </div>
      </div>

      {/* 3. Right: speed, chapters, volume, Read along (same tools as the full player) */}
      <div className="flex-[0_1_260px] min-w-0">
        <PlayerTools showModeToggle />
      </div>
    </div>
  );
}

export default PlayerBar;
