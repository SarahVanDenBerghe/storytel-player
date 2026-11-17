import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAudioContext } from '../contexts/AudioContext';
import { buildCoverUrl, formatTime } from '../utils/helpers';
import ChaptersPopover from './ChaptersPopover';

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
    playbackRate,
    volume,
    isMuted,
    chapters,
    currentChapter,
    togglePlayPause,
    seek,
    skipForward,
    skipBackward,
    setRate,
    setVolume,
    toggleMute,
    jumpToChapter,
    sleepTimerRemaining,
    sleepTimerMode,
    setSleepTimer,
  } = useAudioContext();

  const [showSpeedPopover, setShowSpeedPopover] = useState(false);
  const [showChapterPopover, setShowChapterPopover] = useState(false);
  const [showSleepPopover, setShowSleepPopover] = useState(false);

  const speedRef = useRef<HTMLDivElement>(null);
  const chapterRef = useRef<HTMLDivElement>(null);
  const sleepRef = useRef<HTMLDivElement>(null);

  // Close popovers on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (speedRef.current && !speedRef.current.contains(target)) {
        setShowSpeedPopover(false);
      }
      if (chapterRef.current && !chapterRef.current.contains(target)) {
        setShowChapterPopover(false);
      }
      if (sleepRef.current && !sleepRef.current.contains(target)) {
        setShowSleepPopover(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

  const speeds = [0.75, 1.0, 1.25, 1.5, 1.75, 2.0];
  const sleepOptions: { label: string; value: number | 'chapter' | null }[] = [
    { label: t('player.off', 'Off'), value: null },
    { label: '15 min', value: 15 },
    { label: '30 min', value: 30 },
    { label: '45 min', value: 45 },
    { label: '60 min', value: 60 },
    { label: t('player.endOfChapter', 'End of chapter'), value: 'chapter' },
  ];

  // Shared look for the small right-side tool buttons (36 px pill).
  const focusRing = 'focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF5100]';
  const pillIdle = 'bg-white/[0.06] hover:bg-white/[0.10] text-[#D1D5DB] hover:text-white';
  const pillActive = 'bg-[#FF5100]/[0.15] text-[#FF7A3D]';
  const popoverClass = 'absolute bottom-[88px] right-0 bg-[#17171A] border border-white/[0.10] rounded-[14px] shadow-[0_24px_60px_rgba(0,0,0,0.6)] p-1.5 z-50 flex flex-col gap-0.5 select-none';
  const popoverItem = (selected: boolean) =>
    `w-full text-left px-3 py-1.5 rounded-[8px] text-xs font-semibold flex items-center justify-between transition-colors ${focusRing} ${
      selected ? 'bg-[#FF5100] text-[#0A0A0A]' : 'text-[#D1D5DB] hover:bg-white/[0.06] hover:text-white'
    }`;
  const skipClass = `h-8 min-w-[44px] px-2 rounded-[8px] bg-transparent text-[13px] font-semibold tabular-nums text-[#D1D5DB] hover:text-white hover:bg-white/[0.06] transition-colors ${focusRing}`;

  return (
    <div className="h-[76px] px-5 gap-5 bg-[#121214] border-t border-white/[0.08] flex items-center z-40 select-none flex-shrink-0 relative">
      {/* 1. Left: cover, title, author · chapter */}
      <div className="flex-[0_1_260px] min-w-0 flex items-center gap-3">
        <button
          type="button"
          onClick={handleOpenFullPlayer}
          aria-label={t('player.expand', 'Open full player')}
          className={`w-[52px] h-[52px] rounded-[10px] bg-[#1F2937] overflow-hidden flex-shrink-0 ${focusRing}`}
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
            onClick={() => skipBackward(15)}
            aria-label={t('player.skipBackward', { seconds: 15 })}
            title={t('player.skipBackward', { seconds: 15 })}
            className={skipClass}
          >
            −15s
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
            onClick={() => skipForward(15)}
            aria-label={t('player.skipForward', { seconds: 15 })}
            title={t('player.skipForward', { seconds: 15 })}
            className={skipClass}
          >
            +15s
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

      {/* 3. Right: speed, chapters, sleep timer, volume, expand */}
      <div className="flex-[0_1_260px] flex items-center justify-end gap-2 min-w-0">
        <div className="relative" ref={speedRef}>
          <button
            type="button"
            onClick={() => setShowSpeedPopover((prev) => !prev)}
            aria-label={t('player.speed', 'Speed')}
            aria-expanded={showSpeedPopover}
            title={t('player.speed', 'Speed')}
            className={`h-9 px-2.5 rounded-[10px] text-[12px] font-bold tabular-nums transition-colors flex items-center justify-center ${focusRing} ${
              playbackRate !== 1.0 ? pillActive : pillIdle
            }`}
          >
            {playbackRate.toFixed(Number.isInteger(playbackRate * 10) ? 1 : 2)}×
          </button>

          {showSpeedPopover && (
            <div className={`${popoverClass} w-36`}>
              <div className="text-[11px] font-bold text-[#9CA3AF] px-2 py-1 uppercase tracking-wider">
                {t('player.speed', 'Speed')}
              </div>
              {speeds.map((rate) => (
                <button
                  key={rate}
                  type="button"
                  onClick={() => {
                    setRate(rate);
                    setShowSpeedPopover(false);
                  }}
                  className={popoverItem(playbackRate === rate)}
                >
                  <span>{rate}×</span>
                  {playbackRate === rate && (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="relative" ref={chapterRef}>
          <button
            type="button"
            onClick={() => setShowChapterPopover((prev) => !prev)}
            aria-label={t('player.chapters', 'Chapters')}
            aria-expanded={showChapterPopover}
            title={t('player.chapters', 'Chapters')}
            className={`h-9 px-2.5 rounded-[10px] transition-colors flex items-center gap-1.5 text-[12px] font-semibold ${focusRing} ${
              showChapterPopover ? 'bg-white/[0.12] text-white' : pillIdle
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
            <span className="hidden lg:inline">{t('player.chapters', 'Chapters')}</span>
          </button>

          {showChapterPopover && (
            <ChaptersPopover
              chapters={chapters}
              currentChapter={currentChapter}
              onSelectChapter={jumpToChapter}
              onClose={() => setShowChapterPopover(false)}
            />
          )}
        </div>

        <div className="relative" ref={sleepRef}>
          <button
            type="button"
            onClick={() => setShowSleepPopover((prev) => !prev)}
            aria-label={t('player.sleepTimer', 'Sleep Timer')}
            aria-expanded={showSleepPopover}
            title={t('player.sleepTimer', 'Sleep Timer')}
            className={`w-9 h-9 rounded-[10px] transition-colors flex items-center justify-center relative ${focusRing} ${
              sleepTimerMode !== null ? pillActive : pillIdle
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
            {sleepTimerRemaining !== null && (
              <span className="absolute -top-1 -right-1.5 px-1 rounded-full bg-[#FF5100] text-[#0A0A0A] text-[9px] font-bold tabular-nums">
                {Math.ceil(sleepTimerRemaining / 60)}m
              </span>
            )}
          </button>

          {showSleepPopover && (
            <div className={`${popoverClass} w-48`}>
              <div className="text-[11px] font-bold text-[#9CA3AF] px-2.5 py-1 uppercase tracking-wider">
                {t('player.sleepTimer', 'Sleep Timer')}
              </div>
              {sleepOptions.map((opt, idx) => {
                const isSelected = sleepTimerMode === opt.value;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setSleepTimer(opt.value);
                      setShowSleepPopover(false);
                    }}
                    className={popoverItem(isSelected)}
                  >
                    <span>{opt.label}</span>
                    {isSelected && (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="hidden md:flex items-center gap-2">
          <button
            type="button"
            onClick={toggleMute}
            aria-label={t('player.volume', 'Volume')}
            aria-pressed={isMuted}
            title={t('player.volume', 'Volume')}
            className={`w-9 h-9 rounded-[10px] flex items-center justify-center transition-colors ${focusRing} ${
              isMuted || volume === 0 ? pillActive : pillIdle
            }`}
          >
            {isMuted || volume === 0 ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              </svg>
            )}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={isMuted ? 0 : volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            aria-label={t('player.volume', 'Volume')}
            className={`w-16 lg:w-20 h-1 bg-white/[0.12] rounded-full appearance-none cursor-pointer accent-[#FF5100] ${focusRing}`}
          />
        </div>

        <div className="w-px h-6 bg-white/[0.08] mx-0.5" aria-hidden="true" />

        <button
          type="button"
          onClick={handleOpenFullPlayer}
          aria-label={t('player.expand', 'Open full player')}
          title={t('player.expand', 'Open full player')}
          className={`w-9 h-9 rounded-[10px] flex items-center justify-center transition-colors ${focusRing} ${pillIdle}`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default PlayerBar;
