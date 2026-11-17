import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import LanguageModal from './LanguageModal';
import { findLanguage } from '../config/languages';

interface LanguageButtonProps {
    /** `dock` matches the floating menu, `ghost` sits on a plain background, `topbar` matches top bar. */
    variant?: 'dock' | 'ghost' | 'topbar';
    className?: string;
}

/**
 * Globe button that opens the language picker.
 *
 * Rendered wherever the user might be stranded in the wrong language: the
 * floating dock, top navigation bar, and the login screen. It always shows the active language code
 * next to the globe, so the control is recognisable without reading any text.
 */
export function LanguageButton({ variant = 'dock', className = '' }: LanguageButtonProps) {
    const { t, i18n } = useTranslation();
    const [isOpen, setIsOpen] = useState(false);
    const [code, setCode] = useState(i18n.language);

    useEffect(() => {
        const onChanged = (lng: string) => setCode(lng);
        i18n.on('languageChanged', onChanged);
        return () => {
            i18n.off('languageChanged', onChanged);
        };
    }, [i18n]);

    const language = findLanguage(code);
    const label = t('language.change', { language: language?.nativeName ?? code });

    const base =
        'flex items-center gap-1.5 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FF5100] focus-visible:outline-offset-2';
    const styles =
        variant === 'topbar'
            ? 'h-[38px] px-3 rounded-[10px] bg-[#121214] hover:bg-white/[0.06] border border-white/[0.08] text-[#D1D5DB] hover:text-white'
            : variant === 'dock'
            ? 'rounded-full p-2.5 text-[#9CA3AF] hover:text-white hover:bg-white/10'
            : 'h-9 rounded-[10px] px-3 text-[#D1D5DB] hover:text-white bg-transparent hover:bg-white/[0.06] border border-white/[0.14]';

    return (
        <>
            <button
                type="button"
                onClick={() => setIsOpen(true)}
                title={label}
                aria-label={label}
                className={`${base} ${styles} ${className}`}
            >
                <svg aria-hidden="true" className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.8}
                        d="M21 12a9 9 0 11-18 0 9 9 0 0118 0zM3.6 9h16.8M3.6 15h16.8M12 3a15 15 0 010 18 15 15 0 010-18z"
                    />
                </svg>
                <span aria-hidden="true" className="text-xs font-semibold tracking-wider uppercase">{code}</span>
            </button>

            <LanguageModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
        </>
    );
}

export default LanguageButton;
