import React from 'react';

/** Rewind / fast-forward icon for the skip buttons (player bar, full player, read-along pop-out). */
function SkipIcon({direction, size}: {direction: 'backward' | 'forward'; size: number}) {
    return (
        <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="currentColor"
             style={direction === 'forward' ? {transform: 'scaleX(-1)'} : undefined}>
            <path d="M11 7.2v9.6a.8.8 0 01-1.28.64L3.3 12.64a.8.8 0 010-1.28l6.42-4.8A.8.8 0 0111 7.2zM20 7.2v9.6a.8.8 0 01-1.28.64l-6.42-4.8a.8.8 0 010-1.28l6.42-4.8A.8.8 0 0120 7.2z"/>
        </svg>
    );
}

export default SkipIcon;
