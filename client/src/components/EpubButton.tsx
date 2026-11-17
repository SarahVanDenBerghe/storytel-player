import React, {useEffect, useRef, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {BookShelfEntity} from '../interfaces/books';
import api from '../utils/api';
import {ensureAudioDownloaded, shareEpubWithOtherParts, takeEpubFromOtherParts} from '../utils/readAlongAudio';

const focusRing = 'focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF5100]';
// The reading view's corner icon buttons.
const iconBtn = `w-9 h-9 flex flex-shrink-0 items-center justify-center rounded-[10px] text-[#9CA3AF] hover:text-white hover:bg-white/[0.06] transition-colors ${focusRing}`;
const smallBtn = `h-8 px-3 rounded-[8px] text-[12px] font-semibold transition-colors ${focusRing}`;

/**
 * The Read along view's EPUB corner button: its menu shows the file, prepares
 * the audio when it isn't downloaded, and replaces the file with a confirmation
 * so a stray click never drops it. A new file downloads the audio if needed and
 * starts the Whisper sync; the other parts of a split audiobook share it.
 */
function EpubButton({bookId, book, consumableId, onChanged}: {
    bookId: string;
    book: BookShelfEntity | null;
    consumableId?: string | null;
    /** Called after a new EPUB is stored (the reading view reloads its text). */
    onChanged?: () => void;
}) {
    const {t} = useTranslation();
    const epubApi = window.electronEpub;
    // undefined while still looking it up, null when the book has none.
    const [epubName, setEpubName] = useState<string | null | undefined>(undefined);
    const [preparingPercent, setPreparingPercent] = useState<number | null>(null);
    const [syncProgress, setSyncProgress] = useState<ReadAlongSyncProgress | null>(null);
    const [audioOnDisk, setAudioOnDisk] = useState<boolean | null>(null);
    const [menu, setMenu] = useState<'closed' | 'open' | 'confirmReplace'>('closed');
    const menuRef = useRef<HTMLDivElement>(null);

    // Sync progress and whether the audio is on disk.
    useEffect(() => {
        const epub = window.electronEpub;
        if (!epub) return;
        setSyncProgress(null);
        setAudioOnDisk(null);
        epub.syncGet(bookId).then((snapshot) => setSyncProgress(snapshot.progress)).catch(() => undefined);
        api.get(`/download-status/${bookId}`)
            .then((res) => setAudioOnDisk(!!res.data?.downloaded))
            .catch(() => undefined);
        return epub.onSyncProgress((progress) => {
            if (progress.bookId === bookId) setSyncProgress(progress);
        });
    }, [bookId]);

    // The stored EPUB; without one, take another part's (multi-part books).
    useEffect(() => {
        const epub = window.electronEpub;
        if (!epub) return;
        let alive = true;
        setEpubName(undefined);
        (async () => {
            let name = await epub.name(bookId);
            if (!name && await takeEpubFromOtherParts(bookId)) name = await epub.name(bookId);
            if (alive) setEpubName(name);
        })().catch(() => undefined);
        return () => {
            alive = false;
        };
    }, [bookId]);

    useEffect(() => {
        if (menu === 'closed') return;
        const closeOutside = (e: MouseEvent) => {
            if (!menuRef.current?.contains(e.target as Node)) setMenu('closed');
        };
        const closeOnEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setMenu('closed');
        };
        document.addEventListener('mousedown', closeOutside);
        document.addEventListener('keydown', closeOnEscape);
        return () => {
            document.removeEventListener('mousedown', closeOutside);
            document.removeEventListener('keydown', closeOnEscape);
        };
    }, [menu]);

    const prepareAndSync = async () => {
        if (!epubApi || preparingPercent !== null) return;
        setPreparingPercent(0);
        try {
            const ok = await ensureAudioDownloaded(bookId, consumableId ?? book?.book?.consumableId, book, setPreparingPercent);
            if (!ok) return;
            setAudioOnDisk(true);
            setSyncProgress(await epubApi.syncStart(bookId, 0));
        } catch (err) {
            console.error('Read along: cannot prepare the audio', err);
        } finally {
            setPreparingPercent(null);
        }
    };

    // Cancelling the file dialog keeps the current EPUB.
    const chooseEpub = async () => {
        setMenu('closed');
        if (!epubApi) return;
        try {
            const chosen = await epubApi.choose(bookId);
            if (!chosen) return;
            setEpubName(chosen.name);
            onChanged?.();
            await shareEpubWithOtherParts(bookId);
            await prepareAndSync();
        } catch (err) {
            console.error('Read along: cannot attach the EPUB', err);
        }
    };

    if (!epubApi) return null;

    const syncing = syncProgress?.state === 'running';
    const status = preparingPercent !== null
        ? t('bookView.preparingAudio', {percent: preparingPercent})
        : syncing && syncProgress && syncProgress.chunksTotal > 0
            ? t('bookView.syncingProgress', {done: syncProgress.chunksDone, total: syncProgress.chunksTotal})
            : null;

    return (
        <div className="relative" ref={menuRef}>
            <button
                type="button"
                onClick={() => setMenu(menu === 'closed' ? 'open' : 'closed')}
                aria-expanded={menu !== 'closed'}
                aria-label={t('bookView.epubTitle')}
                title={status ?? t('bookView.epubTitle')}
                className={iconBtn}
            >
                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                     strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z"/>
                    <path d="M14 3v6h6"/>
                </svg>
            </button>
            {epubName && menu !== 'closed' && (
                <div className="absolute top-full right-0 mt-1.5 animate-pop-in origin-top-right w-72 bg-[#17171A] border border-white/[0.10] rounded-[14px] shadow-[0_24px_60px_rgba(0,0,0,0.6)] p-3 z-50 flex flex-col gap-2 text-left">
                    <div className="text-[11px] font-bold text-[#9CA3AF] uppercase tracking-wider">{t('bookView.epubTitle')}</div>
                    <div className="text-[13px] text-[#E5E7EB] break-words">{epubName}</div>
                    {status && <div className="text-[12px] text-[#9CA3AF] tabular-nums">{status}</div>}
                    {audioOnDisk === false && preparingPercent === null && (
                        <button
                            type="button"
                            onClick={() => {
                                setMenu('closed');
                                void prepareAndSync();
                            }}
                            className={`self-start mt-1 ${smallBtn} bg-[#FF5100] hover:bg-[#ff641a] text-white`}
                        >
                            {t('bookView.prepareAudio')}
                        </button>
                    )}
                    {menu === 'open' ? (
                        <button
                            type="button"
                            onClick={() => setMenu('confirmReplace')}
                            className={`self-start mt-1 ${smallBtn} bg-white/[0.06] hover:bg-white/[0.10] text-[#D1D5DB] hover:text-white`}
                        >
                            {t('bookView.replaceEpub')}
                        </button>
                    ) : (
                        <div role="alertdialog" aria-label={t('bookView.replaceEpub')} className="mt-1 flex flex-col gap-2">
                            <p className="text-[12px] leading-[1.5] text-[#D1D5DB]">{t('bookView.replaceConfirm', {name: epubName})}</p>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => setMenu('open')}
                                    className={`${smallBtn} bg-white/[0.06] hover:bg-white/[0.10] text-[#D1D5DB]`}
                                >
                                    {t('common.cancel')}
                                </button>
                                <button
                                    type="button"
                                    onClick={chooseEpub}
                                    className={`${smallBtn} bg-[#FF5100] hover:bg-[#ff641a] text-white`}
                                >
                                    {t('bookView.chooseNewFile')}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default EpubButton;
