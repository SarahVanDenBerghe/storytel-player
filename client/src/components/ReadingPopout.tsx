import React, {useEffect, useMemo, useRef, useState} from 'react';
import {MemoryRouter, Route, Routes} from 'react-router-dom';
import {useTranslation} from 'react-i18next';
import ReadingView, {DEFAULT_TEXT_SIZE, ReadingAudio, TEXT_SIZE_KEY, TEXT_SIZE_STEPS} from './ReadingView';
import {PLAYBACK_RATES} from '../contexts/AudioContext';
import storage from '../utils/storage';
import {SKIP_BACKWARD_SECONDS, SKIP_FORWARD_SECONDS} from '../config/player';
import SkipIcon from './SkipIcon';

const focusRing = 'focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF5100]';
const controlBtn = `h-8 min-w-8 px-2 flex items-center justify-center rounded-full text-[12px] font-semibold text-[#E5E7EB] hover:bg-white/[0.08] transition-colors ${focusRing}`;
// Shown while the pointer is over the window or a control has keyboard focus.
const onHover = 'opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity';
// The window has no frame: this strip is where it can be dragged.
const dragRegion = {WebkitAppRegion: 'drag'} as React.CSSProperties;
const noDragRegion = {WebkitAppRegion: 'no-drag'} as React.CSSProperties;

const control = (c: ReadAlongPopoutControl) => window.electronEpub?.popoutControl(c);

// Speed and text-size menus: the same look as the player bar's speed and Chapters menus.
const menuBtn = `h-7 px-2 flex items-center justify-center rounded-[8px] text-[12px] font-semibold tabular-nums text-[#D1D5DB] bg-white/[0.06] hover:bg-white/[0.10] hover:text-white transition-colors ${focusRing}`;
const popoverClass = 'absolute top-full right-0 mt-1 w-32 max-h-[calc(100vh-44px)] overflow-y-auto bg-[#17171A] border border-white/[0.10] rounded-[14px] shadow-[0_24px_60px_rgba(0,0,0,0.6)] p-1.5 z-50 flex flex-col gap-0.5 select-none';
const popoverHeader = 'text-[11px] font-bold text-[#9CA3AF] px-2 py-1 uppercase tracking-wider';
const popoverItem = (selected: boolean) =>
    `w-full text-left px-3 py-1.5 rounded-[8px] text-xs font-semibold flex items-center justify-between transition-colors ${focusRing} ${
        selected ? 'bg-[#FF5100] text-[#0A0A0A]' : 'text-[#D1D5DB] hover:bg-white/[0.06] hover:text-white'
    }`;
const CheckIcon = () => (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
    </svg>
);

/**
 * Root of the read-along pop-out window (opened from the reading view, see
 * openReadAlongPopout in src/modules/window.ts). It plays no audio: the main
 * window reports its playback state over IPC, and the controls here (and a
 * click on a paragraph) act on the main window's player. It follows whichever
 * book the main window plays.
 */
function ReadingPopout({initialBookId}: {initialBookId: string}) {
    const {t} = useTranslation();
    const [playback, setPlayback] = useState<ReadAlongPlayback | null>(null);

    useEffect(() => {
        const api = window.electronEpub;
        if (!api) return;
        let received = false;
        // Subscribe first; the stored state only fills in until the first live report.
        const unsubscribe = api.onPlayback((next) => {
            received = true;
            setPlayback(next);
        });
        api.getPlayback()
            .then((stored) => {
                if (!received && stored) setPlayback(stored);
            })
            .catch((err) => console.error('Read along pop-out: cannot read the playback state', err));
        return unsubscribe;
    }, []);

    const audio = useMemo<ReadingAudio>(() => ({
        activeBookId: playback?.bookId ?? null,
        currentTime: playback?.currentTime ?? 0,
        duration: playback?.duration ?? 0,
        isPlaying: playback?.isPlaying ?? false,
        playbackRate: playback?.playbackRate ?? 1,
        activeBookName: playback?.bookName ?? null,
        seek: (timeSec: number) => control({type: 'seek', timeSec}),
    }), [playback]);

    const bookId = playback?.bookId ?? initialBookId;
    const isPlaying = !!playback?.isPlaying;
    const playbackRate = playback?.playbackRate ?? 1;

    // Text size is shared with the main window's reading view (see setTextSize in src/preload.ts).
    const [textSize, setTextSize] = useState(DEFAULT_TEXT_SIZE);
    useEffect(() => {
        const apply = (value: unknown) => {
            const size = Number(value);
            if (Number.isFinite(size) && size > 0) setTextSize(size);
        };
        storage.get(TEXT_SIZE_KEY).then(apply).catch(() => undefined);
        return window.electronEpub?.onTextSizeChange(apply);
    }, []);

    const [menu, setMenu] = useState<'speed' | 'textSize' | null>(null);
    const menusRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!menu) return;
        const closeOutside = (e: MouseEvent) => {
            if (!menusRef.current?.contains(e.target as Node)) setMenu(null);
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

    return (
        <div className="group relative h-screen w-screen flex flex-col overflow-hidden bg-[#0A0A0A] text-white select-none">
            {/* ReadingView reads the book from the route; a new book remounts it. */}
            <MemoryRouter key={bookId} initialEntries={[`/read/${bookId}`]}>
                <Routes>
                    <Route path="/read/:bookId" element={<ReadingView popoutAudio={audio}/>}/>
                </Routes>
            </MemoryRouter>

            {/* Top strip: drag the window here. Close dot left (as on macOS), menus right. */}
            <div
                style={dragRegion}
                className={`absolute inset-x-0 top-0 z-40 h-10 px-2.5 flex items-center justify-between bg-gradient-to-b from-[#0A0A0A] via-[#0A0A0A]/80 to-transparent ${menu ? 'opacity-100' : onHover}`}
            >
                <button
                    type="button"
                    style={noDragRegion}
                    onClick={() => window.close()}
                    aria-label={t('readAlong.closePopout')}
                    title={t('readAlong.closePopout')}
                    className={`group/close w-3 h-3 flex items-center justify-center rounded-full bg-[#FF5F57] border border-black/20 text-[#4D0000] ${focusRing}`}
                >
                    <svg aria-hidden="true" className="opacity-0 group-hover/close:opacity-100" width="6" height="6" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round">
                        <path d="M2 2l6 6M8 2L2 8"/>
                    </svg>
                </button>

                <div ref={menusRef} style={noDragRegion} className="flex items-center gap-1.5">
                    {playback?.bookId && (
                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => setMenu(menu === 'speed' ? null : 'speed')}
                                aria-label={t('player.speed')}
                                aria-expanded={menu === 'speed'}
                                title={t('player.speed')}
                                className={menuBtn}
                            >
                                {playbackRate}×
                            </button>
                            {menu === 'speed' && (
                                <div className={popoverClass}>
                                    <div className={popoverHeader}>{t('player.speed')}</div>
                                    {PLAYBACK_RATES.map((rate) => (
                                        <button
                                            key={rate}
                                            type="button"
                                            onClick={() => {
                                                control({type: 'setSpeed', rate});
                                                setMenu(null);
                                            }}
                                            className={popoverItem(playbackRate === rate)}
                                        >
                                            <span>{rate}×</span>
                                            {playbackRate === rate && <CheckIcon/>}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                    <div className="relative">
                        <button
                            type="button"
                            onClick={() => setMenu(menu === 'textSize' ? null : 'textSize')}
                            aria-label={t('readAlong.textSize', {size: textSize})}
                            aria-expanded={menu === 'textSize'}
                            title={t('readAlong.textSize', {size: textSize})}
                            className={`${menuBtn} font-normal text-[14px]`}
                            style={{fontFamily: "Charter, 'Iowan Old Style', Georgia, serif"}}
                        >
                            Aa
                        </button>
                        {menu === 'textSize' && (
                            <div className={popoverClass}>
                                <div className={popoverHeader}>{t('readAlong.textSizeMenu')}</div>
                                {TEXT_SIZE_STEPS.map((size) => (
                                    <button
                                        key={size}
                                        type="button"
                                        onClick={() => {
                                            setTextSize(size);
                                            window.electronEpub?.setTextSize(size).catch(() => undefined);
                                            setMenu(null);
                                        }}
                                        className={popoverItem(textSize === size)}
                                    >
                                        <span>{t('readAlong.textSizeOption', {size})}</span>
                                        {textSize === size && <CheckIcon/>}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {playback?.bookId && (
                <div className={`absolute left-1/2 -translate-x-1/2 bottom-3 z-30 flex items-center gap-0.5 p-0.5 rounded-full bg-[#1A1A1A]/95 border border-white/10 shadow-[0_8px_24px_rgba(0,0,0,0.5)] ${onHover}`}>
                    <button
                        type="button"
                        onClick={() => control({type: 'skip', seconds: -SKIP_BACKWARD_SECONDS})}
                        aria-label={t('player.skipBackward', {seconds: SKIP_BACKWARD_SECONDS})}
                        title={t('player.skipBackward', {seconds: SKIP_BACKWARD_SECONDS})}
                        className={controlBtn}
                    >
                        <SkipIcon direction="backward" size={16}/>
                    </button>
                    <button
                        type="button"
                        onClick={() => control({type: 'toggle'})}
                        aria-label={isPlaying ? t('tray.pause') : t('tray.play')}
                        title={isPlaying ? t('tray.pause') : t('tray.play')}
                        className={`${controlBtn} w-8 bg-[#FF5100] text-[#0A0A0A] hover:bg-[#FF6A26]`}
                    >
                        <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                            {isPlaying
                                ? <path d="M6 4h4v16H6zM14 4h4v16h-4z"/>
                                : <path d="M7 4l13 8-13 8z"/>}
                        </svg>
                    </button>
                    <button
                        type="button"
                        onClick={() => control({type: 'skip', seconds: SKIP_FORWARD_SECONDS})}
                        aria-label={t('player.skipForward', {seconds: SKIP_FORWARD_SECONDS})}
                        title={t('player.skipForward', {seconds: SKIP_FORWARD_SECONDS})}
                        className={controlBtn}
                    >
                        <SkipIcon direction="forward" size={16}/>
                    </button>
                </div>
            )}
        </div>
    );
}

export default ReadingPopout;
