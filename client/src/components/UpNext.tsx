import React, {useEffect, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {useTranslation} from 'react-i18next';
import {BookShelfEntity} from '../interfaces/books';
import {bookCoverOf, bookProgress, bookRouteId, buildCoverUrl, cleanBookTitle} from '../utils/helpers';
import {upNext, useUpNext} from '../hooks/useUpNext';
import {useAudioContext} from '../contexts/AudioContext';
import Modal from './Modal';

const focusRing = 'focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF5100]';
const heading = 'font-serif text-[21px] font-semibold tracking-[-0.012em] leading-[1.2] text-white/[0.92]';
// Covers in the block answer the pointer: a small lift, a touch brighter, a deeper shadow.
const coverHover = 'transition-[transform,filter,box-shadow] duration-200 ease-out group-hover/cover:-translate-y-0.5 group-hover/cover:brightness-110 group-hover/cover:shadow-[0_18px_40px_rgba(0,0,0,0.6)]';
// Shown in the Next column; more would not fit beside the current book.
const MAX_QUEUE_COVERS = 3;

interface Item {
    id: string;
    entry: BookShelfEntity;
    title: string;
    partLabel: string;
    author: string;
    cover: string;
    percent: number;
    isFinished: boolean;
    isStarted: boolean;
}

// Cover colours as found by the main process (coverColor.ts), per URL.
const coverColors = new Map<string, string | null>();

/** The cover's main colour (#rrggbb, darkened for white text), or null until known. */
function useCoverColor(url: string): string | null {
    const [color, setColor] = useState<string | null>(() => coverColors.get(url) ?? null);
    useEffect(() => {
        if (!url || !window.electronWindow) return;
        if (coverColors.has(url)) {
            setColor(coverColors.get(url) ?? null);
            return;
        }
        let alive = true;
        window.electronWindow.coverColor(url)
            .then((found) => {
                coverColors.set(url, found);
                if (alive) setColor(found);
            })
            .catch(() => undefined);
        return () => {
            alive = false;
        };
    }, [url]);
    return color;
}

// Backdrop artwork, only for cleaned covers (served from disk, no title text). Black in the art
// drops out (lighten), so it melts into the block. One book: the art fills the right side.
// With a queue: it sits in the middle and fades on a slant, faint behind the Next column.
const soloArtMask = 'linear-gradient(to right, transparent, #000 70%)';
// Fully clear until 18%: on a slant the image's own left edge reaches that far, and would show as a cut.
const queueArtMask = 'linear-gradient(105deg, transparent 18%, rgba(0,0,0,0.6) 30%, #000 40%, rgba(0,0,0,0.55) 54%, rgba(0,0,0,0.22) 72%, rgba(0,0,0,0.12) 100%)';

/**
 * The home page's "Up next": the starred books in their saved order (useUpNext),
 * as one block tinted with the current cover's main colour. The current book is the first
 * unfinished one; the books after it sit in a Next column. Nothing renders when
 * no book is starred (or every starred book is finished).
 */
function UpNext({books}: {books: BookShelfEntity[]}) {
    const {t} = useTranslation();
    const navigate = useNavigate();
    const audio = useAudioContext();
    const starredIds = useUpNext();
    const [editing, setEditing] = useState(false);

    const byId = new Map(books.map((entry) => [bookRouteId(entry), entry]));
    const items: Item[] = starredIds.flatMap((id) => {
        const entry = byId.get(id);
        if (!entry) return [];
        const {title, part} = cleanBookTitle(entry.book?.name || '');
        const progress = bookProgress(entry);
        // The playing book's progress is fresher in the player than on the shelf.
        const live = String(audio.activeBookId) === id && audio.duration > 0;
        const percent = live ? Math.min((audio.currentTime / audio.duration) * 100, 100) : progress.percent;
        return [{
            id,
            entry,
            title: title || entry.book?.name || '',
            partLabel: part ? t('bookCard.part', {n: part.n, total: part.total}) : '',
            author: entry.book?.authorsAsString || '',
            cover: buildCoverUrl(bookCoverOf(entry)),
            percent,
            isFinished: progress.isFinished,
            isStarted: progress.isStarted || percent > 0,
        }];
    });

    const currentIndex = items.findIndex((item) => !item.isFinished);
    const tint = useCoverColor(currentIndex >= 0 ? items[currentIndex].cover : '');
    if (currentIndex < 0) return null;
    const current = items[currentIndex];
    const queue = items.slice(currentIndex + 1);
    const artwork = current.cover.startsWith('file:') ? current.cover : null;
    const artMask = queue.length === 0 ? soloArtMask : queueArtMask;
    // With art behind a queue the tint carries on to the right edge, so the Next side is not a dark slab.
    const tintEnd = artwork && queue.length > 0 ? `${tint}80 75%, ${tint}5c 100%` : `${tint}33 75%, transparent 100%`;
    const meta = (item: Item) => [item.author, item.partLabel].filter(Boolean).join(' · ');

    const resume = () => navigate(`/player/${current.id}`, {state: {book: current.entry, autoPlay: true}});
    const readAlong = () => {
        // Read along follows the player's book: load it (without playing) first.
        if (String(audio.activeBookId) !== current.id) void audio.loadBook(current.entry, current.id, false);
        navigate(`/read/${current.id}`);
    };
    const open = (item: Item) => navigate(`/player/${item.id}`, {state: {book: item.entry}});

    return (
        <section aria-label={t('upNext.title')}>
            <h2 className={`${heading} mb-4`}>{t('upNext.title')}</h2>

            <div className="group/unb relative overflow-hidden rounded-[12px] bg-[#131315] animate-fade-in">
                {/* Backdrop: a soft gradient from the current cover's main colour, faded in once known */}
                <div
                    aria-hidden="true"
                    className="absolute inset-0 pointer-events-none transition-opacity duration-500 ease-out"
                    style={{
                        opacity: tint ? 1 : 0,
                        background: tint ? `linear-gradient(115deg, ${tint} 0%, ${tint}b3 40%, ${tintEnd})` : undefined,
                    }}
                />
                {artwork && (
                    <img src={artwork} alt="" aria-hidden="true"
                         className={`absolute right-0 top-1/2 -translate-y-1/2 aspect-square object-cover pointer-events-none mix-blend-lighten animate-fade-in ${queue.length === 0 ? 'w-[60%] opacity-60' : 'w-[62%] opacity-50'}`}
                         style={{maskImage: artMask, WebkitMaskImage: artMask}}/>
                )}
                <div className="relative flex gap-7 p-6">
                    <button type="button" onClick={() => open(current)} className={`group/cover flex-shrink-0 rounded-[6px] ${focusRing}`}
                            aria-label={current.title}>
                        <img src={current.cover} alt="" className={`w-[184px] h-[184px] rounded-[6px] object-cover shadow-[0_14px_36px_rgba(0,0,0,0.55)] ${coverHover}`}/>
                    </button>

                    <div className="flex-1 min-w-0 flex flex-col justify-between py-1">
                        <div className="flex flex-col gap-1">
                            <div className="text-[11px] font-semibold tracking-[0.08em] uppercase text-white/70">{t('upNext.listeningNow')}</div>
                            <div className="text-[24px] font-semibold tracking-[-0.015em] leading-[1.2] line-clamp-2" title={current.entry.book?.name}>
                                {current.title}
                            </div>
                            <div className="text-[13px] text-white/70">{meta(current)}</div>
                        </div>
                        <div className="flex flex-col gap-4 max-w-[340px]">
                            <div className="h-1 rounded-sm bg-white/[0.14]" role="progressbar" aria-valuenow={Math.round(current.percent)} aria-valuemin={0} aria-valuemax={100}>
                                <div className="h-1 rounded-sm bg-[#FF5100] transition-[width] duration-300" style={{width: `${current.percent}%`}}/>
                            </div>
                            <div className="flex gap-2">
                                <button type="button" onClick={resume}
                                        className={`h-9 pl-3 pr-4 rounded-[10px] bg-[#FF5100] hover:bg-[#FF6A26] text-white text-[13px] font-semibold flex items-center gap-1.5 transition-colors ${focusRing}`}>
                                    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M9 6.8v10.4a1 1 0 001.5.86l8.3-5.2a1 1 0 000-1.72l-8.3-5.2A1 1 0 009 6.8z"/></svg>
                                    {t('upNext.resume')}
                                </button>
                                <button type="button" onClick={readAlong} aria-label={t('readAlong.open')} title={t('readAlong.open')}
                                        className={`w-9 h-9 rounded-[10px] bg-white/10 hover:bg-white/[0.16] text-white flex items-center justify-center transition-colors ${focusRing}`}>
                                    <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M12 6.25v13M12 6.25C10.8 5.5 9.25 5 7.5 5S4.2 5.5 3 6.25v13C4.2 18.5 5.75 18 7.5 18s3.3.5 4.5 1.25m0-13C13.2 5.5 14.75 5 16.5 5s3.3.5 4.5 1.25v13c-1.2-.75-2.75-1.25-4.5-1.25s-3.3.5-4.5 1.25"/>
                                    </svg>
                                </button>
                                <button type="button" onClick={() => setEditing(true)} aria-label={t('upNext.edit')} title={t('upNext.edit')}
                                        className={`w-9 h-9 rounded-[10px] bg-white/10 hover:bg-white/[0.16] text-white flex items-center justify-center opacity-0 group-hover/unb:opacity-100 focus-visible:opacity-100 transition-[opacity,background-color] duration-150 ${focusRing}`}>
                                    <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>
                                </button>
                            </div>
                        </div>
                    </div>

                    {queue.length > 0 && (
                        <div className="flex-shrink-0 flex flex-col justify-between gap-3.5 py-1 pl-7 border-l border-white/10">
                            <div className="flex flex-col gap-2">
                                <div className="flex justify-between gap-6 text-[12px] text-white/70">
                                    <span className="font-semibold text-white">{t('upNext.next')}</span>
                                    <span>{t('upNext.moreInQueue', {count: queue.length})}</span>
                                </div>
                                <div className="flex gap-1" aria-hidden="true">
                                    {items.map((item, i) => (
                                        <div key={item.id} className="flex-1 h-[3px] rounded-sm bg-white/[0.14] overflow-hidden">
                                            <div className={`h-[3px] ${i < currentIndex || item.isFinished ? 'bg-white/75' : 'bg-[#FF5100]'}`}
                                                 style={{width: `${i < currentIndex || item.isFinished ? 100 : i === currentIndex ? item.percent : 0}%`}}/>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            {queue.length === 1 ? (
                                <button type="button" onClick={() => open(queue[0])} className={`group/cover flex items-center gap-3.5 w-[300px] text-left rounded-[5px] ${focusRing}`}>
                                    <img src={queue[0].cover} alt="" className={`w-[92px] h-[92px] flex-shrink-0 rounded-[5px] object-cover shadow-[0_6px_18px_rgba(0,0,0,0.4)] ${coverHover}`}/>
                                    <span className="min-w-0 flex flex-col gap-0.5">
                                        <span className="text-[13px] font-semibold leading-[1.3] line-clamp-2" title={queue[0].entry.book?.name}>{queue[0].title}</span>
                                        <span className="text-[12px] text-white/65">{meta(queue[0])}</span>
                                    </span>
                                </button>
                            ) : (
                                <div className="flex gap-3.5">
                                    {queue.slice(0, MAX_QUEUE_COVERS).map((item) => (
                                        <button key={item.id} type="button" onClick={() => open(item)} title={item.entry.book?.name}
                                                className={`group/cover w-[92px] flex flex-col gap-1.5 text-left rounded-[5px] ${focusRing}`}>
                                            <img src={item.cover} alt="" className={`w-[92px] h-[92px] rounded-[5px] object-cover shadow-[0_6px_18px_rgba(0,0,0,0.4)] ${coverHover}`}/>
                                            <span className="block w-full">
                                                <span className="block text-[11px] font-medium leading-[1.3] text-white/80 group-hover/cover:text-white transition-colors truncate">{item.title}</span>
                                                <span className="block mt-px text-[11px] leading-[1.3] text-white/50">{item.partLabel}</span>
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {editing && <UpNextEditor items={items} currentIndex={currentIndex} onClose={() => setEditing(false)}/>}
        </section>
    );
}

/** The Edit sheet: drag to reorder, × to remove, Done to close. */
function UpNextEditor({items, currentIndex, onClose}: {items: Item[]; currentIndex: number; onClose: () => void}) {
    const {t} = useTranslation();
    const starredIds = useUpNext();
    const [dragId, setDragId] = useState<string | null>(null);

    const status = (item: Item, i: number) => {
        if (item.isFinished) return t('upNext.statusFinished');
        if (i === currentIndex) return t('upNext.statusListening', {percent: Math.round(item.percent)});
        if (i === currentIndex + 1) return t('upNext.next');
        return item.isStarted ? t('upNext.statusStarted', {percent: Math.round(item.percent)}) : t('upNext.statusNotStarted');
    };

    // Moves the dragged book to the place of the one under the pointer, in the stored order.
    const moveOver = (overId: string) => {
        if (!dragId || dragId === overId) return;
        const next = starredIds.filter((id) => id !== dragId);
        next.splice(next.indexOf(overId) + (starredIds.indexOf(dragId) < starredIds.indexOf(overId) ? 1 : 0), 0, dragId);
        upNext.reorder(next);
    };

    return (
        <Modal isOpen onClose={onClose} title={t('upNext.title')} maxWidth="max-w-[420px]">
            <div className="flex flex-col px-1.5 pb-2">
                {items.map((item, i) => (
                    <div
                        key={item.id}
                        draggable
                        onDragStart={(e) => {
                            setDragId(item.id);
                            e.dataTransfer.effectAllowed = 'move';
                        }}
                        onDragOver={(e) => {
                            e.preventDefault();
                            moveOver(item.id);
                        }}
                        onDragEnd={() => setDragId(null)}
                        className={`flex items-center gap-3 px-2.5 py-2 rounded-[10px] cursor-grab active:cursor-grabbing transition-[background-color,opacity] ${
                            i === currentIndex ? 'bg-white/[0.05]' : ''
                        } ${dragId === item.id ? 'opacity-50' : ''}`}
                    >
                        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth={2} strokeLinecap="round"><path d="M5 9h14M5 15h14"/></svg>
                        <img src={item.cover} alt="" className="w-9 h-9 rounded-[5px] object-cover flex-shrink-0"/>
                        <div className="flex-1 min-w-0">
                            <div className="text-[13px] font-semibold truncate">{[item.title, item.partLabel].filter(Boolean).join(' · ')}</div>
                            <div className="text-[12px] text-[#9CA3AF]">{status(item, i)}</div>
                        </div>
                        <button
                            type="button"
                            onClick={() => upNext.remove(item.id)}
                            aria-label={t('upNext.removeItem', {title: [item.title, item.partLabel].filter(Boolean).join(', ')})}
                            title={t('upNext.removeStar')}
                            className={`w-7 h-7 rounded-full text-[#9CA3AF] hover:text-white hover:bg-white/[0.06] flex items-center justify-center transition-colors ${focusRing}`}
                        >
                            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
                        </button>
                    </div>
                ))}
            </div>
            <div className="flex items-center justify-between gap-3 px-[18px] pt-2.5 pb-3.5 border-t border-white/[0.05]">
                <span className="text-[12px] text-[#9CA3AF]">{t('upNext.editHint')}</span>
                <button type="button" onClick={onClose}
                        className={`h-7 px-3 rounded-[8px] bg-[#FF5100] hover:bg-[#FF6A26] text-white text-[12px] font-semibold transition-colors ${focusRing}`}>
                    {t('upNext.done')}
                </button>
            </div>
        </Modal>
    );
}

export default UpNext;
