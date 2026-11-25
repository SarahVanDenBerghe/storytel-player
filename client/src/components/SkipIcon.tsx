import React from 'react';

/**
 * Rewind / forward 15 s icon for the skip buttons (player bar, full player, read-along pop-out):
 * a curved arrow with "15", so it reads as a jump in time, not a track change. Tabler Icons
 * (MIT) "rewind-backward-15" / "rewind-forward-15". The "15" is drawn in: keep it in step with
 * SKIP_BACKWARD_SECONDS / SKIP_FORWARD_SECONDS in config/player.ts.
 */
function SkipIcon({direction, size}: {direction: 'backward' | 'forward'; size: number}) {
    return (
        <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
             strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            {direction === 'backward' ? (
                <>
                    <path d="M8 20h2a1 1 0 0 0 1 -1v-1a1 1 0 0 0 -1 -1h-2v-3h3"/>
                    <path d="M15 18a6 6 0 1 0 0 -12h-11"/>
                    <path d="M5 14v6"/>
                    <path d="M7 9l-3 -3l3 -3"/>
                </>
            ) : (
                <>
                    <path d="M17 9l3 -3l-3 -3"/>
                    <path d="M9 18a6 6 0 1 1 0 -12h11"/>
                    <path d="M16 20h2a1 1 0 0 0 1 -1v-1a1 1 0 0 0 -1 -1h-2v-3h3"/>
                    <path d="M13 14v6"/>
                </>
            )}
        </svg>
    );
}

export default SkipIcon;
