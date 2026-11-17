import React, {useEffect, useRef, useState} from 'react';
import {useLocation, useNavigate} from 'react-router-dom';
import {useTranslation} from 'react-i18next';
import {PLAYBACK_RATES, useAudioContext} from '../contexts/AudioContext';
import ChaptersPopover from './ChaptersPopover';

const focusRing = 'focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF5100]';
const pillIdle = 'bg-white/[0.06] hover:bg-white/[0.10] text-[#D1D5DB] hover:text-white';
const pillActive = 'bg-[#FF5100]/[0.15] text-[#FF7A3D]';
const iconBtn = `w-9 h-9 flex-shrink-0 rounded-[10px] flex items-center justify-center transition-colors ${focusRing}`;
const popoverBase = 'absolute right-0 bg-[#17171A] border border-white/[0.10] rounded-[14px] shadow-[0_24px_60px_rgba(0,0,0,0.6)] p-1.5 z-50 flex flex-col gap-0.5 select-none';
const popoverItem = (selected: boolean) =>
    `w-full text-left px-3 py-1.5 rounded-[8px] text-xs font-semibold flex items-center justify-between transition-colors ${focusRing} ${
        selected ? 'bg-[#FF5100] text-[#0A0A0A]' : 'text-[#D1D5DB] hover:bg-white/[0.06] hover:text-white'
    }`;
const header = 'text-[11px] font-bold text-[#9CA3AF] px-2 py-1 uppercase tracking-wider';

type Menu = 'speed' | 'chapters' | 'volume' | null;

/**
 * The player's tool buttons, shared by the footer (PlayerBar) and the full
 * player's bottom-right corner: speed, chapters and volume menus, plus
 * bookmarks (full player) and the Read along toggle (footer).
 */
function PlayerTools({popoverOffset = 'bottom-[88px]', onShowBookmarks, showReadAlong = false}: {
    /** Where menus open, measured from the bottom of their button. */
    popoverOffset?: string;
    onShowBookmarks?: () => void;
    showReadAlong?: boolean;
}) {
    const {t} = useTranslation();
    const navigate = useNavigate();
    const location = useLocation();
    const {
        activeBookId, playbackRate, setRate, volume, isMuted, setVolume, toggleMute,
        chapters, currentChapter, jumpToChapter,
    } = useAudioContext();
    const [menu, setMenu] = useState<Menu>(null);
    const rootRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!menu) return;
        const closeOutside = (e: MouseEvent) => {
            if (!rootRef.current?.contains(e.target as Node)) setMenu(null);
        };
        const closeOnEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setMenu(null);
        };
        document.addEventListener('mousedown', closeOutside);
        document.addEventListener('keydown', closeOnEscape);
        return () => {
            document.removeEventListener('mousedown', closeOutside);
            document.removeEventListener('keydown', closeOnEscape);
        };
    }, [menu]);

    const toggle = (next: Menu) => setMenu(menu === next ? null : next);
    const isSilent = isMuted || volume === 0;
    const isReading = location.pathname.startsWith('/read/');

    return (
        <div ref={rootRef} className="flex items-center justify-end gap-2 min-w-0">
            <div className="relative">
                <button
                    type="button"
                    onClick={() => toggle('speed')}
                    aria-label={t('player.speed', 'Speed')}
                    aria-expanded={menu === 'speed'}
                    title={t('player.speed', 'Speed')}
                    className={`h-9 px-2.5 rounded-[10px] text-[12px] font-bold tabular-nums transition-colors flex items-center justify-center ${focusRing} ${
                        playbackRate !== 1.0 ? pillActive : pillIdle
                    }`}
                >
                    {playbackRate.toFixed(Number.isInteger(playbackRate * 10) ? 1 : 2)}×
                </button>
                {menu === 'speed' && (
                    <div className={`${popoverBase} ${popoverOffset} w-36`}>
                        <div className={header}>{t('player.speed', 'Speed')}</div>
                        {PLAYBACK_RATES.map((rate) => (
                            <button
                                key={rate}
                                type="button"
                                onClick={() => {
                                    setRate(rate);
                                    setMenu(null);
                                }}
                                className={popoverItem(playbackRate === rate)}
                            >
                                <span>{rate}×</span>
                                {playbackRate === rate && (
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
                                    </svg>
                                )}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <div className="relative">
                <button
                    type="button"
                    onClick={() => toggle('chapters')}
                    aria-label={t('player.chapters', 'Chapters')}
                    aria-expanded={menu === 'chapters'}
                    title={t('player.chapters', 'Chapters')}
                    className={`h-9 px-2.5 rounded-[10px] transition-colors flex items-center gap-1.5 text-[12px] font-semibold ${focusRing} ${
                        menu === 'chapters' ? 'bg-white/[0.12] text-white' : pillIdle
                    }`}
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16"/>
                    </svg>
                    <span className="hidden lg:inline">{t('player.chapters', 'Chapters')}</span>
                </button>
                {menu === 'chapters' && (
                    <ChaptersPopover
                        chapters={chapters}
                        currentChapter={currentChapter}
                        onSelectChapter={jumpToChapter}
                        onClose={() => setMenu(null)}
                        positionClass={`${popoverOffset} right-0`}
                    />
                )}
            </div>

            {onShowBookmarks && (
                <button
                    type="button"
                    onClick={onShowBookmarks}
                    aria-label={t('player.bookmarks', 'Bookmarks')}
                    title={t('player.bookmarks', 'Bookmarks')}
                    className={`${iconBtn} ${pillIdle}`}
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/>
                    </svg>
                </button>
            )}

            <div className="relative">
                <button
                    type="button"
                    onClick={() => toggle('volume')}
                    aria-label={t('player.volume', 'Volume')}
                    aria-expanded={menu === 'volume'}
                    title={t('player.volume', 'Volume')}
                    className={`${iconBtn} ${isSilent ? pillActive : pillIdle}`}
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"/>
                        {isSilent
                            ? <path d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"/>
                            : <path d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728"/>}
                    </svg>
                </button>
                {menu === 'volume' && (
                    <div className={`${popoverBase} ${popoverOffset} w-52 !flex-row items-center gap-2 px-2 py-2`}>
                        <button
                            type="button"
                            onClick={toggleMute}
                            aria-label={t('player.volume', 'Volume')}
                            aria-pressed={isMuted}
                            className={`w-7 h-7 flex-shrink-0 rounded-[8px] flex items-center justify-center transition-colors ${focusRing} ${isSilent ? pillActive : pillIdle}`}
                        >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"/>
                                {isSilent && <path d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"/>}
                            </svg>
                        </button>
                        <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.05}
                            value={isMuted ? 0 : volume}
                            onChange={(e) => setVolume(parseFloat(e.target.value))}
                            aria-label={t('player.volume', 'Volume')}
                            className={`flex-1 h-1 bg-white/[0.12] rounded-full appearance-none cursor-pointer accent-[#FF5100] ${focusRing}`}
                        />
                    </div>
                )}
            </div>

            {showReadAlong && (
                <>
                    <div className="w-px h-6 bg-white/[0.08] mx-0.5" aria-hidden="true"/>
                    {/* Opens Read along, or closes it when it is the current page. */}
                    <button
                        type="button"
                        onClick={() => activeBookId && navigate(isReading ? `/player/${activeBookId}` : `/read/${activeBookId}`)}
                        aria-label={t('readAlong.open')}
                        aria-pressed={isReading}
                        title={t('readAlong.open')}
                        className={`${iconBtn} ${isReading ? pillActive : pillIdle}`}
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M2 5h7a3 3 0 013 3v12a2 2 0 00-2-2H2zM22 5h-7a3 3 0 00-3 3v12a2 2 0 012-2h8z"/>
                        </svg>
                    </button>
                </>
            )}
        </div>
    );
}

export default PlayerTools;
