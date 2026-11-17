import React, {useEffect, useMemo, useState} from 'react';
import {MemoryRouter, Route, Routes} from 'react-router-dom';
import {useTranslation} from 'react-i18next';
import ReadingView, {ReadingAudio} from './ReadingView';
import {SKIP_BACKWARD_SECONDS, SKIP_FORWARD_SECONDS} from '../config/player';

const focusRing = 'focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF5100]';
const controlBtn = `h-8 min-w-8 px-2 flex items-center justify-center rounded-full text-[12px] font-semibold text-[#E5E7EB] hover:bg-white/[0.08] transition-colors ${focusRing}`;
// Shown while the pointer is over the window or a control has keyboard focus.
const onHover = 'opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity';
// The window has no frame: this strip is where it can be dragged.
const dragRegion = {WebkitAppRegion: 'drag'} as React.CSSProperties;
const noDragRegion = {WebkitAppRegion: 'no-drag'} as React.CSSProperties;

const control = (c: ReadAlongPopoutControl) => window.electronEpub?.popoutControl(c);

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
        seek: (timeSec: number) => control({type: 'seek', timeSec}),
    }), [playback]);

    const bookId = playback?.bookId ?? initialBookId;
    const isPlaying = !!playback?.isPlaying;

    return (
        <div className="group relative h-screen w-screen flex flex-col overflow-hidden bg-[#0A0A0A] text-white select-none">
            {/* ReadingView reads the book from the route; a new book remounts it. */}
            <MemoryRouter key={bookId} initialEntries={[`/read/${bookId}`]}>
                <Routes>
                    <Route path="/read/:bookId" element={<ReadingView popoutAudio={audio}/>}/>
                </Routes>
            </MemoryRouter>

            <div style={dragRegion} className={`absolute inset-x-0 top-0 z-30 h-7 flex justify-end bg-gradient-to-b from-[#0A0A0A] to-transparent ${onHover}`}>
                <button
                    type="button"
                    style={noDragRegion}
                    onClick={() => window.close()}
                    aria-label={t('common.close')}
                    title={t('common.close')}
                    className={`m-1 w-6 h-6 flex items-center justify-center rounded-full text-[#9CA3AF] hover:text-white hover:bg-white/[0.08] transition-colors ${focusRing}`}
                >
                    <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                         strokeWidth={2.5} strokeLinecap="round">
                        <path d="M6 6l12 12M18 6L6 18"/>
                    </svg>
                </button>
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
                        −{SKIP_BACKWARD_SECONDS}s
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
                        +{SKIP_FORWARD_SECONDS}s
                    </button>
                    <button
                        type="button"
                        onClick={() => control({type: 'cycleSpeed'})}
                        aria-label={t('player.speed')}
                        title={t('player.speed')}
                        className={`${controlBtn} tabular-nums`}
                    >
                        {playback.playbackRate}×
                    </button>
                </div>
            )}
        </div>
    );
}

export default ReadingPopout;
