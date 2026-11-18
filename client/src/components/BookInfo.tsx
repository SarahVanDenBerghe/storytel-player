import React from 'react';
import {useTranslation} from 'react-i18next';
import {buildCoverUrl, cleanBookTitle, formatTime} from '../utils/helpers';
import {BookShelfEntity} from '../interfaces/books';
import {Chapter} from '../interfaces/chapters';

interface BookInfoProps {
    book: BookShelfEntity;
    currentChapter: {
        title: string;
        start: number;
        end: number;
        durationInSeconds?: number;
        number?: number;
    } | null;
    chapters: Chapter[];
    currentTime: number;
    playbackRate: number;
    onShowChaptersModal: () => void;
}

const BookInfo: React.FC<BookInfoProps> = ({
                                               book,
                                               currentChapter,
                                               chapters,
                                               currentTime,
                                               playbackRate,
                                               onShowChaptersModal,
                                           }) => {
    const {t} = useTranslation();

    const author = book.book.authorsAsString;
    // Short title, as on the home page ("Golden Son"); the part goes in the line below.
    const {title: shortTitle, part} = cleanBookTitle(book.book.name);
    const hasChapters = chapters && chapters.length > 0;
    const chapterTimeLeft = currentChapter
        ? formatTime(Math.max(0, (currentChapter.end - currentTime) / playbackRate))
        : null;

    // "author · part · chapter title · time left in chapter"; missing parts are dropped.
    const metaParts: React.ReactNode[] = [];
    if (author) metaParts.push(<span key="author">{author}</span>);
    if (part) metaParts.push(<span key="part">{t('bookCard.part', {n: part.n, total: part.total})}</span>);
    if (currentChapter?.title) {
        metaParts.push(hasChapters ? (
            <button
                key="chapter"
                type="button"
                onClick={onShowChaptersModal}
                className="rounded hover:text-white hover:underline transition-colors focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF5100]"
            >
                {currentChapter.title}
            </button>
        ) : (
            <span key="chapter">{currentChapter.title}</span>
        ));
    }
    if (chapterTimeLeft) {
        metaParts.push(
            <span key="left" className="tabular-nums">
                {t('player.chapterTimeLeft', {time: chapterTimeLeft, defaultValue: '{{time}} left'})}
            </span>
        );
    }

    return (
        <div className="flex flex-col items-center w-full">
            <img
                src={buildCoverUrl(book.book.largeCover || book.book.largeCoverE)}
                alt=""
                className="w-[280px] max-w-[70vw] aspect-square object-cover rounded-[6px] bg-[#141416] cover-border shadow-[0_24px_60px_rgba(0,0,0,0.6)]"
            />
            <h1 className="mt-6 max-w-[480px] font-serif text-[22px] font-semibold leading-[1.25] text-white text-center break-words"
                title={book.book.name}>
                {shortTitle || book.book.name}
            </h1>
            {metaParts.length > 0 && (
                <p className="mt-1 max-w-[480px] text-[13px] text-[#9CA3AF] text-center break-words">
                    {metaParts.map((part, i) => (
                        <React.Fragment key={i}>
                            {i > 0 && ' · '}
                            {part}
                        </React.Fragment>
                    ))}
                </p>
            )}
        </div>
    );
};

export default BookInfo;
