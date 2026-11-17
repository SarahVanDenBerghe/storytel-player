import React from 'react';
import {useTranslation} from 'react-i18next';

interface NavbarProps {
    barTitle: string;
    onBackClick: () => void;
    children?: React.ReactNode;
}

/**
 * Corner controls: an icon-only back button floating top-left and optional
 * content floating top-right. The parent element must be `position: relative`.
 * `barTitle` is not shown; it labels the navigation landmark for screen readers.
 */
function Navbar({onBackClick, barTitle, children}: NavbarProps) {
    const {t} = useTranslation();

    return (
        <nav
            aria-label={barTitle}
            className="absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-4 px-3 py-2 pointer-events-none"
        >
            <button
                type="button"
                onClick={onBackClick}
                aria-label={t('common.back', 'Back')}
                className="pointer-events-auto w-11 h-11 flex flex-shrink-0 items-center justify-center rounded-[10px] text-[#9CA3AF] hover:text-white hover:bg-white/[0.06] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF5100]"
            >
                <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                     strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M15 18l-6-6 6-6"/>
                </svg>
            </button>
            {children && (
                <div className="pointer-events-auto min-w-0 max-w-[50%] h-11 flex items-center text-[13px] text-[#9CA3AF]">
                    <div className="truncate">{children}</div>
                </div>
            )}
        </nav>
    );
}

export default Navbar;
