import React, {useEffect} from 'react';
import {useTranslation} from 'react-i18next';
import {useWindowDrag} from '../hooks/useWindowDrag';

/**
 * The minimized read-along pop-out: the app icon as a round button in a small
 * transparent window (see minimizeReadAlongPopout in src/modules/window.ts).
 * A click brings the pop-out back; a drag moves it, snapping to a bottom corner.
 */
function ReadingBubble() {
    const {t} = useTranslation();
    const drag = useWindowDrag();

    // The window is transparent: only the circle should show.
    useEffect(() => {
        document.documentElement.style.background = 'transparent';
        document.body.style.background = 'transparent';
    }, []);

    return (
        <div className="h-screen w-screen flex items-center justify-center select-none">
            <button
                type="button"
                {...drag}
                onClick={() => window.electronEpub?.restorePopout()}
                aria-label={t('readAlong.showPopout')}
                title={t('readAlong.showPopout')}
                className="w-10 h-10 rounded-full flex items-center justify-center bg-[#FFF2F1] border border-black/[0.08] shadow-[0_4px_18px_rgba(0,0,0,0.12)] hover:scale-[1.06] transition-transform duration-150 focus:outline-none"
            >
                {/* The app icon's own background is this pale pink, so only the mark shrinks. */}
                <img src="assets/icon.png" alt="" draggable={false} className="w-7 h-7 rounded-full pointer-events-none"/>
            </button>
        </div>
    );
}

export default ReadingBubble;
