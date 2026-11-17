import React from 'react';
import {useTranslation} from 'react-i18next';
import {formatTime} from '../utils/helpers';

interface PlayerControlsProps {
    isPlaying: boolean;
    currentTime: number;
    duration: number;
    volume: number;
    isMuted: boolean;
    playbackRate: number;
    hasChapters: boolean;
    isDownloaded: boolean;
    isDownloading: boolean;
    onPlayPause: () => void;
    onSeek: (time: number) => void;
    onVolumeChange: (volume: number) => void;
    onToggleMute: () => void;
    onSkipForward: () => void;
    onSkipBackward: () => void;
    onShowGotoModal: () => void;
    onShowPlaybackSpeedModal: () => void;
    onShowChaptersModal: () => void;
    onShowBookmarksModal: () => void;
    onDownloadClick: () => void;
}

const SKIP_SECONDS = 15;

const focusRing = 'focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF5100]';
// Small secondary action button; every entry of the action row uses it, so new
// actions (e.g. "Read along") can simply be appended to the row.
const actionBtn = `h-9 px-3 rounded-[10px] text-[13px] flex items-center gap-2 transition-colors ${focusRing}`;
const actionIdle = 'bg-white/[0.06] text-[#D1D5DB] hover:bg-white/[0.10] hover:text-white';
const actionActive = 'bg-[#FF5100]/[0.15] text-[#FF7A3D] hover:bg-[#FF5100]/[0.22]';
const skipBtn = `h-11 min-w-[56px] px-2.5 rounded-[10px] bg-transparent text-[15px] font-semibold tabular-nums text-[#E5E7EB] hover:text-white hover:bg-white/[0.06] transition-colors ${focusRing}`;

const iconProps = {
    width: 15,
    height: 15,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
};

const PlayerControls: React.FC<PlayerControlsProps> = ({
    isPlaying,
    currentTime,
    duration,
    volume,
    isMuted,
    playbackRate,
    hasChapters,
    isDownloaded,
    isDownloading,
    onPlayPause,
    onSeek,
    onVolumeChange,
    onToggleMute,
    onSkipForward,
    onSkipBackward,
    onShowGotoModal,
    onShowPlaybackSpeedModal,
    onShowChaptersModal,
    onShowBookmarksModal,
    onDownloadClick,
}) => {
    const {t} = useTranslation();

    const progressPercent = duration > 0 ? Math.min(Math.max((currentTime / duration) * 100, 0), 100) : 0;
    // Times on this page are shown in "listening time", i.e. adjusted for playback speed.
    const elapsed = currentTime / playbackRate;
    const remaining = Math.max(0, duration - currentTime) / playbackRate;
    const isSilent = isMuted || volume === 0;

    return (
        <div className="w-full flex flex-col items-center">
            {/* Progress */}
            <div className="w-full max-w-[480px] mt-7">
                <div className="relative flex items-center py-2 rounded [&:has(:focus-visible)]:outline [&:has(:focus-visible)]:outline-2 [&:has(:focus-visible)]:outline-offset-2 [&:has(:focus-visible)]:outline-[#FF5100]">
                    <div className="w-full h-1 bg-white/[0.12] rounded-full overflow-hidden">
                        <div className="h-full bg-[#FF5100] rounded-full" style={{width: `${progressPercent}%`}}/>
                    </div>
                    <input
                        type="range"
                        min={0}
                        max={duration || 0}
                        step="any"
                        value={currentTime}
                        onChange={(e) => onSeek(parseFloat(e.target.value))}
                        aria-label={t('player.seekPosition', 'Playback position')}
                        aria-valuetext={formatTime(elapsed)}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                </div>
                <div className="flex justify-between text-[12px] text-[#9CA3AF] tabular-nums">
                    <span>{formatTime(elapsed)}</span>
                    <span>−{formatTime(remaining)}</span>
                </div>
            </div>

            {/* Transport */}
            <div className="mt-4 flex items-center gap-7">
                <button
                    type="button"
                    onClick={onSkipBackward}
                    aria-label={t('player.skipBackward', {seconds: SKIP_SECONDS})}
                    title={t('player.skipBackward', {seconds: SKIP_SECONDS})}
                    className={skipBtn}
                >
                    −{SKIP_SECONDS}s
                </button>

                <button
                    type="button"
                    onClick={onPlayPause}
                    aria-label={isPlaying ? t('tray.pause', 'Pause') : t('tray.play', 'Play')}
                    className={`w-[60px] h-[60px] rounded-full bg-[#FF5100] hover:bg-[#ff641a] text-white flex items-center justify-center shadow-[0_6px_20px_rgba(255,81,0,0.3)] transition-colors ${focusRing}`}
                >
                    {isPlaying ? (
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                            <rect x="6.5" y="5" width="3.5" height="14" rx="1.25"/>
                            <rect x="14" y="5" width="3.5" height="14" rx="1.25"/>
                        </svg>
                    ) : (
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                            <path d="M9 6.8v10.4a1 1 0 001.5.86l8.3-5.2a1 1 0 000-1.72l-8.3-5.2A1 1 0 009 6.8z"/>
                        </svg>
                    )}
                </button>

                <button
                    type="button"
                    onClick={onSkipForward}
                    aria-label={t('player.skipForward', {seconds: SKIP_SECONDS})}
                    title={t('player.skipForward', {seconds: SKIP_SECONDS})}
                    className={skipBtn}
                >
                    +{SKIP_SECONDS}s
                </button>
            </div>

            {/* Secondary actions */}
            <div className="mt-7 flex flex-wrap justify-center gap-2">
                {hasChapters && (
                    <button type="button" onClick={onShowChaptersModal} className={`${actionBtn} ${actionIdle}`}>
                        <svg {...iconProps}><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>
                        {t('player.chapters')}
                    </button>
                )}

                <button
                    id="bookmark-btn"
                    type="button"
                    onClick={onShowBookmarksModal}
                    className={`${actionBtn} ${actionIdle}`}
                >
                    <svg {...iconProps}><path d="M6 3h12v18l-6-4-6 4z"/></svg>
                    {t('player.bookmarks')}
                </button>

                <button
                    type="button"
                    onClick={onShowPlaybackSpeedModal}
                    aria-label={`${t('player.speed')} ${playbackRate}×`}
                    title={t('player.speed')}
                    className={`${actionBtn} font-semibold tabular-nums ${playbackRate !== 1 ? actionActive : actionIdle}`}
                >
                    {playbackRate.toFixed(Number.isInteger(playbackRate * 10) ? 1 : 2)}×
                </button>

                <button type="button" onClick={onShowGotoModal} className={`${actionBtn} ${actionIdle}`}>
                    {t('gotoModal.title')}
                </button>

                <button
                    id="download-btn"
                    type="button"
                    onClick={onDownloadClick}
                    className={`${actionBtn} ${isDownloaded || isDownloading ? actionActive : actionIdle}`}
                >
                    {isDownloading ? (
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" className="animate-spin" aria-hidden="true">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                        </svg>
                    ) : isDownloaded ? (
                        <svg {...iconProps}><path d="M5 13l4 4L19 7"/></svg>
                    ) : (
                        <svg {...iconProps}><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>
                    )}
                    {isDownloading
                        ? t('player.downloading', 'Downloading…')
                        : isDownloaded
                            ? t('player.downloaded', 'Downloaded')
                            : t('player.download')}
                </button>

                {/* Volume: click toggles mute; hovering or focusing reveals the slider */}
                <div className="relative group">
                    <button
                        type="button"
                        onClick={onToggleMute}
                        aria-pressed={isMuted}
                        className={`${actionBtn} ${isSilent ? actionActive : actionIdle}`}
                    >
                        {isSilent ? (
                            <svg {...iconProps}>
                                <path d="M11 5L6 9H3v6h3l5 4V5z"/>
                                <path d="M17 10l4 4m0-4l-4 4"/>
                            </svg>
                        ) : (
                            <svg {...iconProps}>
                                <path d="M11 5L6 9H3v6h3l5 4V5z"/>
                                <path d="M15.5 8.5a5 5 0 010 7M18.5 5.5a9 9 0 010 13"/>
                            </svg>
                        )}
                        {t('player.volume')}
                    </button>
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 pb-2 z-20 opacity-0 pointer-events-none transition-opacity group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto">
                        <div className="bg-[#17171A] border border-white/[0.10] rounded-[10px] px-3 py-2.5 shadow-[0_12px_32px_rgba(0,0,0,0.5)] flex">
                            <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.01"
                                value={volume}
                                onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
                                aria-label={t('player.volume')}
                                className={`w-28 h-1 bg-white/[0.12] rounded-full appearance-none cursor-pointer accent-[#FF5100] ${focusRing}`}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PlayerControls;
