import React, {useEffect, useRef, useState} from 'react';
import {useTranslation} from 'react-i18next';

const focusRing = 'focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF5100]';
const popoverItem = (selected: boolean) =>
    `w-full text-left px-3 py-1.5 rounded-[8px] text-xs font-semibold flex items-center justify-between transition-colors ${focusRing} ${
        selected ? 'bg-[#FF5100] text-white' : 'text-[var(--ra-text)] hover:bg-[var(--ra-fill)] hover:text-[var(--ra-strong)]'
    }`;
/**
 * The read-along "Aa" button and its menu of text sizes, styled like the
 * player's speed and Chapters menus. Used by the reading view and the pop-out.
 */
function TextSizeMenu({value, sizes, onChange, buttonClassName, onOpenChange}: {
    value: number;
    sizes: number[];
    onChange: (size: number) => void;
    buttonClassName: string;
    /** The pop-out keeps its hover controls visible while the menu is open. */
    onOpenChange?: (open: boolean) => void;
}) {
    const {t} = useTranslation();
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        onOpenChange?.(open);
        if (!open) return;
        const closeOutside = (e: MouseEvent) => {
            if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
        };
        const closeOnEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false);
        };
        document.addEventListener('mousedown', closeOutside);
        document.addEventListener('keydown', closeOnEscape);
        return () => {
            document.removeEventListener('mousedown', closeOutside);
            document.removeEventListener('keydown', closeOnEscape);
        };
        // onOpenChange is a notification only; re-running for a new function identity is not needed.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    return (
        <div ref={rootRef} className="relative">
            <button
                type="button"
                onClick={() => setOpen(!open)}
                aria-label={t('readAlong.textSize', {size: value})}
                aria-expanded={open}
                title={t('readAlong.textSize', {size: value})}
                className={`${buttonClassName} font-serif`}
            >
                Aa
            </button>
            {open && (
                <div className="absolute top-full right-0 mt-1 animate-pop-in origin-top-right w-32 max-h-[calc(100vh-56px-var(--ra-vh-trim,0px))] overflow-y-auto bg-[var(--ra-surface)] border border-[var(--ra-line)] rounded-[14px] shadow-[0_24px_60px_rgba(0,0,0,0.6)] p-1.5 z-50 flex flex-col gap-0.5 select-none" role="group" aria-label={t('readAlong.textSizeMenu')}>
                    {sizes.map((size) => (
                        <button
                            key={size}
                            type="button"
                            onClick={() => {
                                onChange(size);
                                setOpen(false);
                            }}
                            className={popoverItem(value === size)}
                        >
                            <span>{t('readAlong.textSizeOption', {size})}</span>
                            {value === size && (
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
                                </svg>
                            )}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

export default TextSizeMenu;
