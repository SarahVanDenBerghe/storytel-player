import {Chapter} from '../interfaces/chapters';
import {EpubParagraph} from './epub';

// "BLOOD AND PISS" -> "Blood and Piss"; titles in mixed case are kept as they are.
const SMALL_WORDS = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to']);
const titleCase = (text: string) => (text !== text.toUpperCase() ? text : text.toLowerCase().replace(
    /[\p{L}']+/gu, (word, offset: number) => (offset > 0 && SMALL_WORDS.has(word) ? word : word[0].toUpperCase() + word.slice(1)),
));
const PART_HEADING = /^part\b/i;
const NUMBER_HEADING = /^(chapter\s+)?(\d+|[ivxlcdm]+)\.?$/i;

/**
 * The book's chapters from its headings. EPUBs often split one chapter heading in
 * several: "PART I" + "BOW" before a part, "1" + "WARLORDS" for a chapter. Headings
 * with no text between them form one group: a part (and its subtitle) is left out, a
 * number joins the title after it ("Warlords", shown with the book's number), and other
 * groups ("Prologue") stand as they are, without a number. timeOf gives a paragraph's audio time, or null outside the synced audio.
 */
export function bookChapterList(paragraphs: EpubParagraph[], timeOf: (index: number) => number | null, duration: number): Chapter[] | null {
    const groups: {title: string; label: string; start: number | null; first: number}[] = [];
    let group: number[] = [];
    const close = () => {
        if (group.length === 0) return;
        const texts = group.map((i) => paragraphs[i].text.trim());
        const numberAt = texts.findIndex((text) => NUMBER_HEADING.test(text));
        const isPart = PART_HEADING.test(texts[0]);
        if (!isPart || numberAt >= 0) {
            const title = numberAt >= 0
                ? texts[numberAt + 1] ?? texts[numberAt].replace(/^(?!chapter)/i, 'Chapter ')
                : texts.join(' · ');
            const start = group.map(timeOf).find((time) => time !== null) ?? null;
            const label = numberAt >= 0 ? texts[numberAt].replace(/^chapter\s+/i, '').replace(/\.$/, '') : '';
            groups.push({title: titleCase(title), label, start, first: group[0]});
        }
        group = [];
    };
    paragraphs.forEach((p, i) => {
        if (!p.heading) close();
        else if (p.text.trim()) group.push(i);
    });
    close();

    const found: {title: string; label: string; start: number}[] = [];
    let before: {title: string; label: string} | null = null;
    let firstIndex = -1;
    for (const g of groups) {
        if (g.start === null) {
            if (found.length === 0 && g.label) before = g;
        } else if (g.start < duration && (found.length === 0 || g.start > found[found.length - 1].start)) {
            if (found.length === 0) firstIndex = g.first;
            found.push({title: g.title, label: g.label, start: g.start});
        }
    }
    if (found.length === 0) return null;
    // A later part of a split audiobook may open mid-chapter: then the text just before
    // its first heading is narrated in this audio, and that stretch is the earlier chapter.
    // Otherwise (only the opening credits) it gets no chapter.
    let lastText = firstIndex - 1;
    while (lastText >= 0 && paragraphs[lastText].heading) lastText--;
    if (before && found[0].start > 1 && lastText >= 0 && timeOf(lastText) !== null) found.unshift({...before, start: 0});
    // number stays a running count (the player matches the current chapter by it); label is what shows.
    return found.map((c, i) => {
        const end = found[i + 1]?.start ?? duration;
        return {number: i + 1, label: c.label, title: c.title, start: c.start, end, durationInSeconds: end - c.start};
    });
}
