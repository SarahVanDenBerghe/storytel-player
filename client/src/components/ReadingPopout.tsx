import React, {useEffect, useMemo, useState} from 'react';
import {MemoryRouter, Route, Routes} from 'react-router-dom';
import ReadingView, {ReadingAudio} from './ReadingView';

/**
 * Root of the read-along pop-out window (opened from the reading view, see
 * openReadAlongPopout in src/modules/window.ts). It plays no audio: the main
 * window reports its playback state over IPC, and a click on a paragraph asks
 * the main window to seek. It follows whichever book the main window plays.
 */
function ReadingPopout({initialBookId}: {initialBookId: string}) {
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
        seek: (timeSec: number) => window.electronEpub?.seekFromPopout(timeSec),
    }), [playback]);

    const bookId = playback?.bookId ?? initialBookId;

    return (
        <div className="h-screen w-screen flex flex-col overflow-hidden bg-[#0A0A0A] text-white select-none">
            {/* ReadingView reads the book from the route; a new book remounts it. */}
            <MemoryRouter key={bookId} initialEntries={[`/read/${bookId}`]}>
                <Routes>
                    <Route path="/read/:bookId" element={<ReadingView popoutAudio={audio}/>}/>
                </Routes>
            </MemoryRouter>
        </div>
    );
}

export default ReadingPopout;
