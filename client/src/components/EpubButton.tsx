import React, {useEffect, useRef, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {BookShelfEntity} from '../interfaces/books';
import api from '../utils/api';
import {otherBookParts} from '../utils/helpers';
import {ensureAudioDownloaded} from '../utils/readAlongAudio';

const focusRing = 'focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF5100]';
// Same look as the full player's other action buttons (PlayerControls).
const actionBtn = `h-9 px-3 rounded-[10px] text-[13px] flex items-center gap-2 transition-colors bg-white/[0.06] text-[#D1D5DB] hover:bg-white/[0.10] hover:text-white ${focusRing}`;
const smallBtn = `h-8 px-3 rounded-[8px] text-[12px] font-semibold transition-colors ${focusRing}`;

/**
 * Read along's EPUB for one book, in the full player: choose one, or see the
 * current file and replace it (with a confirmation, so a stray click never drops
 * it). Choosing downloads the audio if needed and starts the Whisper sync; the
 * button then shows "Preparing audio… n%" and "Syncing x of y". The other parts
 * of a multi-part book share the EPUB.
 */
function EpubButton({bookId, book, consumableId}: {
    bookId: string;
    book: BookShelfEntity | null;
    consumableId?: string | null;
}) {
    const {t} = useTranslation();
    const epubApi = window.electronEpub;
    const [epubName, setEpubName] = useState<string | null>(null);
    const [preparingPercent, setPreparingPercent] = useState<number | null>(null);
    const [syncProgress, setSyncProgress] = useState<ReadAlongSyncProgress | null>(null);
    const [audioOnDisk, setAudioOnDisk] = useState<boolean | null>(null);
    const [menu, setMenu] = useState<'closed' | 'open' | 'confirmReplace'>('closed');
    const menuRef = useRef<HTMLDivElement>(null);
    const bookName = book?.book?.name;

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
        if (!epub || !book) return;
        let alive = true;
        setEpubName(null);
        (async () => {
            let name = await epub.name(bookId);
            if (!name) {
                const shelf = await api.get('/bookshelf').then((res) => res.data?.books || []).catch(() => []);
                for (const part of otherBookParts(book, shelf)) {
                    const partId = String(part.abook?.id || part.id);
                    if (await epub.name(partId)) {
                        await epub.link(partId, [bookId]);
                        name = await epub.name(bookId);
                        break;
                    }
                }
            }
            if (alive) setEpubName(name);
        })().catch(() => undefined);
        return () => {
            alive = false;
        };
        // Re-run per book, not per render of the same book entity.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bookId, bookName]);

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
        if (!epubApi || !book) return;
        try {
            const chosen = await epubApi.choose(bookId);
            if (!chosen) return;
            setEpubName(chosen.name);
            const shelf = await api.get('/bookshelf').then((res) => res.data?.books || []).catch(() => []);
            const parts = otherBookParts(book, shelf).map((part: BookShelfEntity) => String(part.abook?.id || part.id));
            if (parts.length > 0) await epubApi.link(bookId, parts);
            await prepareAndSync();
        } catch (err) {
            console.error('Read along: cannot attach the EPUB', err);
        }
    };

    if (!epubApi) return null;

    const syncing = syncProgress?.state === 'running';
    const label = preparingPercent !== null
        ? t('bookView.preparingAudio', {percent: preparingPercent})
        : syncing && syncProgress && syncProgress.chunksTotal > 0
            ? t('bookView.syncingProgress', {done: syncProgress.chunksDone, total: syncProgress.chunksTotal})
            : epubName ? t('bookView.epub') : t('bookView.chooseEpub');

    return (
        <div className="relative" ref={menuRef}>
            <button
                type="button"
                onClick={epubName ? () => setMenu(menu === 'closed' ? 'open' : 'closed') : chooseEpub}
                aria-expanded={epubName ? menu !== 'closed' : undefined}
                className={`${actionBtn} tabular-nums`}
            >
                <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                     strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z"/>
                    <path d="M14 3v6h6"/>
                </svg>
                {label}
            </button>
            {epubName && menu !== 'closed' && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-72 bg-[#17171A] border border-white/[0.10] rounded-[14px] shadow-[0_24px_60px_rgba(0,0,0,0.6)] p-3 z-50 flex flex-col gap-2 text-left">
                    <div className="text-[11px] font-bold text-[#9CA3AF] uppercase tracking-wider">{t('bookView.epubTitle')}</div>
                    <div className="text-[13px] text-[#E5E7EB] break-words">{epubName}</div>
                    {syncing && <div className="text-[12px] text-[#9CA3AF]">{t('bookView.epubSyncing')}</div>}
                    {audioOnDisk === false && preparingPercent === null && (
                        <button
                            type="button"
                            onClick={() => {
                                setMenu('closed');
                                void prepareAndSync();
                            }}
                            className={`self-start mt-1 ${smallBtn} bg-[#FF5100] hover:bg-[#ff641a] text-[#0A0A0A]`}
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
                                    className={`${smallBtn} bg-[#FF5100] hover:bg-[#ff641a] text-[#0A0A0A]`}
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
