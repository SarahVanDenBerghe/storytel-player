import React, {useEffect, useMemo, useRef, useState} from 'react';
import {MemoryRouter, Route, Routes} from 'react-router-dom';
import {useTranslation} from 'react-i18next';
import ReadingView, {DEFAULT_TEXT_SIZE, POPOUT_MAX_TEXT_SIZE, ReadingAudio, TEXT_SIZE_KEY, TEXT_SIZE_STEPS} from './ReadingView';
import {PLAYBACK_RATES} from '../contexts/AudioContext';
import storage from '../utils/storage';
import {SKIP_BACKWARD_SECONDS, SKIP_FORWARD_SECONDS} from '../config/player';
import SkipIcon from './SkipIcon';
import TextSizeMenu from './TextSizeMenu';
import {ResizeEdge, startWindowResize, useWindowDrag} from '../hooks/useWindowDrag';

const focusRing = 'focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF5100]';
const controlBtn = `h-8 min-w-8 px-2 flex items-center justify-center rounded-full text-[12px] font-semibold transition-colors ${focusRing}`;
// Skip buttons: a soft fill on hover (the play button keeps its own orange).
const skipBtn = `${controlBtn} text-[var(--ra-control)] hover:bg-[var(--ra-fill-strong)]`;
// Shown while the pointer is over the window or a control has keyboard focus.
// Controls show while the mouse is over the window and moving (see IDLE_HIDE_MS), or
// while keyboard focus is in them; a mouse click's focus alone doesn't keep them up.
const onHover = 'opacity-0 group-hover/controls:opacity-100 has-[:focus-visible]:opacity-100 transition-[opacity,transform] duration-200 ease-out';
// The controls hide after this long without mouse movement, even with the mouse over the window.
const IDLE_HIDE_MS = 10_000;

const POPOUT_THEME_KEY = 'readAlong.popoutTheme';

const control = (c: ReadAlongPopoutControl) => window.electronEpub?.popoutControl(c);

// Speed and text-size menus: the same look as the player bar's speed and Chapters menus.
const menuBtn = `h-7 px-2 flex items-center justify-center rounded-[8px] text-[12px] font-semibold tabular-nums text-[var(--ra-text)] glass hover:text-[var(--ra-strong)] transition-colors ${focusRing}`;
const popoverClass = 'absolute top-full right-0 mt-1 animate-pop-in origin-top-right w-32 max-h-[calc(100vh-44px-var(--ra-vh-trim,0px))] overflow-y-auto glass-menu p-1.5 z-50 flex flex-col gap-0.5 select-none';
const popoverItem = (selected: boolean) =>
    `w-full text-left px-3 py-1.5 rounded-[8px] text-xs font-semibold flex items-center justify-between transition-colors ${focusRing} ${
        selected ? 'bg-[#FF5100] text-white' : 'text-[var(--ra-text)] hover:bg-[var(--ra-fill)] hover:text-[var(--ra-strong)]'
    }`;
const CheckIcon = () => (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
    </svg>
);

// The window is transparent around the visible pop-out: this padding holds its
// soft shadow. Must match POPOUT_INSET in src/modules/window.ts.
const WINDOW_INSET = 32;
// Resize handles on the visible edges: thin strips, and corners a bit larger.
const RESIZE_HANDLES: {edge: ResizeEdge; className: string}[] = [
    {edge: 'n', className: 'top-0 inset-x-3 h-1.5 cursor-ns-resize'},
    {edge: 's', className: 'bottom-0 inset-x-3 h-1.5 cursor-ns-resize'},
    {edge: 'w', className: 'left-0 inset-y-3 w-1.5 cursor-ew-resize'},
    {edge: 'e', className: 'right-0 inset-y-3 w-1.5 cursor-ew-resize'},
    {edge: 'nw', className: 'top-0 left-0 w-3 h-3 cursor-nwse-resize'},
    {edge: 'se', className: 'bottom-0 right-0 w-3 h-3 cursor-nwse-resize'},
    {edge: 'ne', className: 'top-0 right-0 w-3 h-3 cursor-nesw-resize'},
    {edge: 'sw', className: 'bottom-0 left-0 w-3 h-3 cursor-nesw-resize'},
];

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

    // Always the player's book (the one in the player bar).
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

    // Light or dark, for this window only; remembered in electron-store.
    const [light, setLight] = useState(false);
    useEffect(() => {
        storage.get(POPOUT_THEME_KEY).then((value) => setLight(value === 'light')).catch(() => undefined);
    }, []);
    const toggleTheme = () => {
        const next = !light;
        setLight(next);
        storage.set(POPOUT_THEME_KEY, next ? 'light' : 'dark').catch(() => undefined);
    };

    // The window has no frame: the top strip drags it (by hand, so it can snap
    // to a bottom corner on release; see useWindowDrag). Its buttons stay buttons.
    const drag = useWindowDrag();
    const onStripPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        if ((e.target as Element).closest('button, [role="group"]')) return;
        drag.onPointerDown(e);
    };

    const [menu, setMenu] = useState<'speed' | null>(null);
    const [textSizeMenuOpen, setTextSizeMenuOpen] = useState(false);
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

    // The window around the visible pop-out is transparent.
    const [idle, setIdle] = useState(false);
    const idleTimerRef = useRef<number | undefined>(undefined);
    const wake = () => {
        setIdle(false);
        window.clearTimeout(idleTimerRef.current);
        idleTimerRef.current = window.setTimeout(() => setIdle(true), IDLE_HIDE_MS);
    };
    useEffect(() => () => window.clearTimeout(idleTimerRef.current), []);

    useEffect(() => {
        document.documentElement.style.background = 'transparent';
        document.body.style.background = 'transparent';
    }, []);

    return (
        // --ra-vh-trim: the menus size themselves to the window height (100vh), which includes the padding.
        <div className="h-screen w-screen" style={{padding: WINDOW_INSET, '--ra-vh-trim': `${2 * WINDOW_INSET}px`} as React.CSSProperties}>
        <div
            onPointerMove={wake}
            onPointerDown={wake}
            className={`group ${idle ? '' : 'group/controls'} relative h-full w-full flex flex-col overflow-hidden rounded-[10px] border border-[var(--ra-line)] shadow-[0_6px_22px_rgba(0,0,0,0.16)] bg-[var(--ra-bg)] text-[var(--ra-strong)] select-none popout-glass ${light ? 'ra-light' : ''}`}>
            {RESIZE_HANDLES.map(({edge, className}) => (
                <div key={edge} aria-hidden="true" onPointerDown={(e) => startWindowResize(edge, e)} className={`absolute z-50 ${className}`}/>
            ))}
            {/* ReadingView reads the book from the route; a new book remounts it. */}
            <MemoryRouter key={bookId} initialEntries={[`/read/${bookId}`]}>
                <Routes>
                    <Route path="/read/:bookId" element={<ReadingView popoutAudio={audio}/>}/>
                </Routes>
            </MemoryRouter>

            {/* Top strip: drag the window here. Window dots left (as on macOS), menus right. */}
            <div
                onPointerDown={onStripPointerDown}
                onClickCapture={drag.onClickCapture}
                className={`absolute inset-x-0 top-0 z-40 h-10 px-2.5 flex items-center justify-between ${menu || textSizeMenuOpen ? 'opacity-100' : `${onHover} -translate-y-1 group-hover/controls:translate-y-0 has-[:focus-visible]:translate-y-0`}`}
            >
                {/* The macOS window dots: close, and minimize to a bubble in the screen corner. */}
                <div className="group/lights flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => window.close()}
                        aria-label={t('readAlong.closePopout')}
                        title={t('readAlong.closePopout')}
                        className={`w-3 h-3 flex items-center justify-center rounded-full bg-[#FF5F57] border border-black/20 text-[#4D0000] ${focusRing}`}
                    >
                        <svg aria-hidden="true" className="opacity-0 group-hover/lights:opacity-100" width="6" height="6" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round">
                            <path d="M2 2l6 6M8 2L2 8"/>
                        </svg>
                    </button>
                    <button
                        type="button"
                        onClick={() => window.electronEpub?.minimizePopout()}
                        aria-label={t('readAlong.minimizePopout')}
                        title={t('readAlong.minimizePopout')}
                        className={`w-3 h-3 flex items-center justify-center rounded-full bg-[#FEBC2E] border border-black/20 text-[#5A3A00] ${focusRing}`}
                    >
                        <svg aria-hidden="true" className="opacity-0 group-hover/lights:opacity-100" width="6" height="6" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round">
                            <path d="M1.5 5h7"/>
                        </svg>
                    </button>
                </div>

                <div ref={menusRef} className="flex items-center gap-1.5">
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
                                <div className={popoverClass} role="group" aria-label={t('player.speed')}>
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
                    <TextSizeMenu
                        value={Math.min(textSize, POPOUT_MAX_TEXT_SIZE)}
                        sizes={TEXT_SIZE_STEPS.filter((size) => size <= POPOUT_MAX_TEXT_SIZE)}
                        onChange={(size) => {
                            setTextSize(size);
                            window.electronEpub?.setTextSize(size).catch(() => undefined);
                        }}
                        buttonClassName={`${menuBtn} font-normal text-[14px]`}
                        onOpenChange={setTextSizeMenuOpen}
                    />
                    <button
                        type="button"
                        onClick={toggleTheme}
                        aria-label={t(light ? 'readAlong.darkTheme' : 'readAlong.lightTheme')}
                        title={t(light ? 'readAlong.darkTheme' : 'readAlong.lightTheme')}
                        className={`${menuBtn} w-7 px-0`}
                    >
                        {/* Shows the theme a click switches to. */}
                        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                             strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                            {/* Solid glyphs, so they carry the same weight as the bold text buttons beside them. */}
                            {light
                                ? <path fill="currentColor" d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/>
                                : <><circle fill="currentColor" cx="12" cy="12" r="5"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></>}
                        </svg>
                    </button>
                </div>
            </div>

            {playback?.bookId && (
                <div className={`absolute left-1/2 -translate-x-1/2 bottom-3 z-30 flex items-center gap-0.5 p-0.5 rounded-full glass shadow-[0_8px_24px_var(--ra-shadow)] ${onHover} translate-y-1 group-hover/controls:translate-y-0 has-[:focus-visible]:translate-y-0`}>
                    <button
                        type="button"
                        onClick={() => control({type: 'skip', seconds: -SKIP_BACKWARD_SECONDS})}
                        aria-label={t('player.skipBackward', {seconds: SKIP_BACKWARD_SECONDS})}
                        title={t('player.skipBackward', {seconds: SKIP_BACKWARD_SECONDS})}
                        className={skipBtn}
                    >
                        <SkipIcon direction="backward" size={16}/>
                    </button>
                    <button
                        type="button"
                        onClick={() => control({type: 'toggle'})}
                        aria-label={isPlaying ? t('tray.pause') : t('tray.play')}
                        title={isPlaying ? t('tray.pause') : t('tray.play')}
                        className={`${controlBtn} w-8 bg-[#FF5100] text-white hover:bg-[#FF6A26]`}
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
                        className={skipBtn}
                    >
                        <SkipIcon direction="forward" size={16}/>
                    </button>
                </div>
            )}
        </div>
        </div>
    );
}

export default ReadingPopout;
