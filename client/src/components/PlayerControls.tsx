import React from 'react';
import {useTranslation} from 'react-i18next';
import {formatTime} from '../utils/helpers';
import {SKIP_BACKWARD_SECONDS, SKIP_FORWARD_SECONDS} from '../config/player';
import SkipIcon from './SkipIcon';

// Progress and transport of the full player. Its tools (speed, chapters,
// bookmarks, volume) sit in the bottom-right corner (PlayerTools), the download
// button top right (PlayerView).
interface PlayerControlsProps {
    isPlaying: boolean;
    currentTime: number;
    duration: number;
    playbackRate: number;
    onPlayPause: () => void;
    onSeek: (time: number) => void;
    onSkipForward: () => void;
    onSkipBackward: () => void;
    /** Preview of a book not in the player: only play works; skipping and seeking are dimmed. */
    seekDisabled?: boolean;
    /** The main action under the transport (the read-along button). */
    children?: React.ReactNode;
}


const focusRing = 'focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF5100]';
const skipBtn = `h-11 w-12 flex items-center justify-center rounded-[10px] bg-transparent text-[#E5E7EB] hover:text-[#FF5100] disabled:opacity-40 disabled:hover:text-[#E5E7EB] transition-colors ${focusRing}`;


const PlayerControls: React.FC<PlayerControlsProps> = ({
    isPlaying,
    currentTime,
    duration,
    playbackRate,
    onPlayPause,
    onSeek,
    onSkipForward,
    onSkipBackward,
    seekDisabled = false,
    children,
}) => {
    const {t} = useTranslation();

    const progressPercent = duration > 0 ? Math.min(Math.max((currentTime / duration) * 100, 0), 100) : 0;
    // Times on this page are shown in "listening time", i.e. adjusted for playback speed.
    const elapsed = currentTime / playbackRate;
    const remaining = Math.max(0, duration - currentTime) / playbackRate;

    return (
        <div className="w-full flex flex-col items-center">
            {/* Progress */}
            <div className={`w-full max-w-[480px] mt-7 ${seekDisabled ? 'opacity-50 pointer-events-none' : ''}`}>
                <div className="relative flex items-center py-2 rounded [&:has(:focus-visible)]:outline [&:has(:focus-visible)]:outline-2 [&:has(:focus-visible)]:outline-offset-2 [&:has(:focus-visible)]:outline-[#FF5100]">
                    <div className="w-full h-1 bg-white/[0.12] rounded-full overflow-hidden">
                        <div className={`h-full bg-[#FF5100] rounded-full transition-[width] duration-300 ease-linear ${isPlaying ? 'progress-live' : ''}`} style={{width: `${progressPercent}%`}}/>
                    </div>
                    <input
                        type="range"
                        min={0}
                        max={duration || 0}
                        step="any"
                        value={currentTime}
                        onChange={(e) => onSeek(parseFloat(e.target.value))}
                        disabled={seekDisabled}
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
                    disabled={seekDisabled}
                    aria-label={t('player.skipBackward', {seconds: SKIP_BACKWARD_SECONDS})}
                    title={t('player.skipBackward', {seconds: SKIP_BACKWARD_SECONDS})}
                    className={skipBtn}
                >
                    <SkipIcon direction="backward" size={26}/>
                </button>

                <button
                    type="button"
                    onClick={onPlayPause}
                    aria-label={isPlaying ? t('tray.pause', 'Pause') : t('tray.play', 'Play')}
                    className={`w-[60px] h-[60px] rounded-full bg-[#FF5100] hover:bg-[#FF6A26] text-white flex items-center justify-center shadow-[0_6px_20px_rgba(255,81,0,0.3)] transition-colors ${focusRing}`}
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
                    disabled={seekDisabled}
                    aria-label={t('player.skipForward', {seconds: SKIP_FORWARD_SECONDS})}
                    title={t('player.skipForward', {seconds: SKIP_FORWARD_SECONDS})}
                    className={skipBtn}
                >
                    <SkipIcon direction="forward" size={26}/>
                </button>
            </div>

            {/* The one main action under the transport (Read along / Choose EPUB) */}
            {children && <div className="mt-7 flex justify-center">{children}</div>}
        </div>
    );
};

export default PlayerControls;
