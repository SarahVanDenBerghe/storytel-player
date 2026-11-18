import { BookShelfEntity } from '../interfaces/books';

// Build a usable cover URL. The new bookshelf API returns absolute URLs
// (https://covers.storytel.com/...); the legacy API returned relative paths
// that needed the www.storytel.com host prepended. Storytel only serves the
// 640px variant, so there is no smaller size to request.
// Covers made on disk win, keyed by the ISBN that starts the cover's file name
// (.../jpg-640/<ISBN>.<uuid>): 'clean' has no text at all (Up next, player), 'tidy' is the
// original minus publisher logos (the library grid, where the cover is the only label).
export const buildCoverUrl = (cover?: string | null, level: 'clean' | 'tidy' = 'clean'): string => {
    if (!cover) return '';
    const isbn = cover.split('/').pop()?.split('.')[0];
    const cleaned = isbn ? window.electronCovers?.overrides[level === 'tidy' ? `${isbn}.tidy` : isbn] : undefined;
    if (cleaned) return cleaned;
    return /^https?:\/\//.test(cover) ? cover : `https://www.storytel.com${cover}`;
};

export const localizedLanguageName = (
    code?: string | null,
    uiLocale = 'en',
    fallbackName?: string | null
): string => {
    if (!code) {
        return fallbackName ? fallbackName.charAt(0).toUpperCase() + fallbackName.slice(1) : '';
    }
    try {
        const name = new Intl.DisplayNames([uiLocale], {type: 'language'}).of(code);
        if (name && name.toLowerCase() !== code.toLowerCase()) {
            return name.charAt(0).toUpperCase() + name.slice(1);
        }
    } catch {
        // ignore Intl lookup error
    }
    if (fallbackName) {
        return fallbackName.charAt(0).toUpperCase() + fallbackName.slice(1);
    }
    return code.toUpperCase();
};

export const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
};


export interface TimeUnitLabels {
    hours: string;
    minutes: string;
    seconds?: string;
}

export const formatMicrosecondsTime = (
    microseconds: number,
    units: TimeUnitLabels
): string => {
    const totalSeconds = Math.floor(microseconds / 1000 / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    return `${hours} ${units.hours} ${minutes} ${units.minutes}`;
};

export const formatTimeNatural = (seconds: number, units: Required<TimeUnitLabels>): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    const parts = [];
    if (hours > 0) {
        parts.push(`${hours} ${units.hours}`);
    }
    if (minutes > 0) {
        parts.push(`${minutes} ${units.minutes}`);
    }
    if (secs > 0 || parts.length === 0) {
        parts.push(`${secs} ${units.seconds}`);
    }

    return parts.join(' ');
};

export const truncateTitle = (title: string, maxLength: number = 30): string => {
    if (title.length <= maxLength) return title;
    return title.substring(0, maxLength - 3) + '...';
};

// Shorten a raw Storytel title for compact cards: drop a "[...]" edition tag and
// everything after it, pull "(n of m)" out as a part number, and (only when there
// was no tag) cut the subtitle after the first ": ".
/** The id a book is routed by (/player/:id), and its stored per-book data keyed by. */
export const bookRouteId = (book: BookShelfEntity): string => String(book.abook?.id || book.id);

/** The book's best cover image URL (unbuilt), or '' when it has none. */
export const bookCoverOf = (book: BookShelfEntity | null | undefined): string =>
    book?.book?.largeCover || book?.book?.largeCoverE || book?.book?.cover || book?.book?.coverE || book?.book?.smallCover || '';

/** Listening progress from the shelf entry (positions in microseconds), as on the library cards. */
export const bookProgress = (book: BookShelfEntity): { percent: number; isFinished: boolean; isStarted: boolean } => {
    const position = book.abookMark ? book.abookMark.pos : 0;
    const total = book.abook?.time || 0;
    const percent = total > 0 ? Math.min(Math.max((position / total) * 100, 0), 100) : 0;
    const isFinished = book.status === 3 || (total > 0 && position >= total * 0.98);
    return { percent, isFinished, isStarted: position > 0 && !isFinished };
};

/**
 * The other parts of a multi-part book ("Golden Son (1 of 2)" and "(2 of 2)") on
 * the shelf. Storytel's series data is empty for these, so parts are matched by
 * cleaned title, part count and author.
 */
export const otherBookParts = (book: BookShelfEntity, shelf: BookShelfEntity[]): BookShelfEntity[] => {
    const own = cleanBookTitle(book.book?.name || '');
    if (!own.part) return [];
    return shelf.filter((other) => {
        const parsed = cleanBookTitle(other.book?.name || '');
        return parsed.part !== undefined
            && parsed.part.n !== own.part!.n
            && parsed.part.total === own.part!.total
            && parsed.title === own.title
            && other.book?.authorsAsString === book.book?.authorsAsString;
    });
};

export const cleanBookTitle = (raw: string): { title: string; part?: { n: number; total: number } } => {
    let title = raw;
    const tagIndex = title.search(/\[[^\]]*\]/);
    if (tagIndex >= 0) title = title.slice(0, tagIndex);

    let part: { n: number; total: number } | undefined;
    const partMatch = title.match(/\((\d+)\s+of\s+(\d+)\)/i);
    if (partMatch) {
        part = { n: Number(partMatch[1]), total: Number(partMatch[2]) };
        title = title.replace(partMatch[0], ' ');
    }

    if (tagIndex < 0) {
        const colonIndex = title.indexOf(': ');
        if (colonIndex >= 0) title = title.slice(0, colonIndex);
    }

    title = title.replace(/\s+/g, ' ').trim();
    return part ? { title, part } : { title };
};
