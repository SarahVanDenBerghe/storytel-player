import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAudioContext } from '../contexts/AudioContext';
import { buildCoverUrl, formatTime } from '../utils/helpers';
import { SKIP_BACKWARD_SECONDS, SKIP_FORWARD_SECONDS } from '../config/player';
import SkipIcon from './SkipIcon';
import PlayerTools from './PlayerTools';

export function PlayerBar() {
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

  const bookTitle = activeBook?.book?.name || `Storytel ${t('search.audiobook')}`;
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
  const skipClass = `h-8 w-9 flex items-center justify-center rounded-[8px] bg-transparent text-[#D1D5DB] hover:text-white hover:bg-white/[0.06] transition-colors ${focusRing}`;

  return (
    <div className="h-[76px] px-5 gap-5 bg-[#121214] border-t border-white/[0.08] flex items-center z-40 select-none flex-shrink-0 relative">
      {/* 1. Left: cover, title, author · chapter */}
      <div className="flex-[0_1_260px] min-w-0 flex items-center gap-3">
        <button
          type="button"
          onClick={handleOpenFullPlayer}
          aria-label={t('player.expand', 'Open full player')}
          className={`w-[52px] h-[52px] rounded-[10px] bg-[#1F2937] cover-border overflow-hidden flex-shrink-0 ${focusRing}`}
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
            title={bookTitle}
            className={`block max-w-full text-left text-[14px] font-semibold text-white truncate hover:text-[#FF7A3D] transition-colors rounded ${focusRing}`}
          >
            {bookTitle}
          </button>
          {(authorName || currentChapter) && (
            <div
              className="text-[12px] text-[#9CA3AF] truncate mt-0.5"
              title={[authorName, currentChapter?.title].filter(Boolean).join(' · ')}
            >
              {[authorName, currentChapter?.title].filter(Boolean).join(' · ')}
            </div>
          )}
        </div>
      </div>

      {/* 2. Centre: transport row + scrubber */}
      <div className="flex-[1_1_360px] min-w-0 max-w-[560px] mx-auto flex flex-col items-center gap-1">
        <div className="flex items-center gap-[14px]">
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
            className={`w-10 h-10 rounded-full bg-[#FF5100] hover:bg-[#ff641a] text-white flex items-center justify-center transition-colors disabled:cursor-wait ${focusRing}`}
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
              <div className="h-full bg-[#FF5100] rounded-full" style={{ width: `${progressPercent}%` }} />
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
        <PlayerTools showReadAlong />
      </div>
    </div>
  );
}

export default PlayerBar;
