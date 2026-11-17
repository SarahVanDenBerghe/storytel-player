// Read along: matches a Whisper transcript of the audiobook to the EPUB text.
// Pure functions, no React. Word pairs from short windows of transcript vote
// for where in the book that window starts; confident, in-order windows become
// anchors (audio time → word), and positions between anchors are interpolated.

/** Words per vote bucket: a window votes for the 25-word block it starts in. */
const BUCKET_WORDS = 25;
/** Transcript windows are 25 s of segments, on a grid that restarts per chunk. */
const WINDOW_SEC = 25;
/** Must match CHUNK_SEC in src/modules/readAlongSync.ts. */
const CHUNK_SEC = 600;
const MIN_PAIRS = 8;
const MIN_CONFIDENCE = 0.3;
/** A manual anchor replaces automatic ones this close; a position this close to an anchor is "synced". */
const SYNCED_SEC = 60;
/** Narration rate used when there is only one anchor to extrapolate from. */
const FALLBACK_WORDS_PER_SEC = 2.5;

export interface BookIndex {
  /** Every normalised word of the book, in reading order. */
  words: string[];
  /** Paragraph index of each word. */
  paragraphOfWord: number[];
  /** Index of the first word of each paragraph (a paragraph without words gets the next word's index). */
  firstWordOfParagraph: number[];
  /** "w1 w2" → every position of w1 where w2 follows. */
  pairPositions: Map<string, number[]>;
}

export interface SyncAnchor {
  timeSec: number;
  wordIndex: number;
  manual?: boolean;
}

export interface SyncSegment {
  start: number;
  end: number;
  text: string;
}

export interface SyncPosition {
  paragraphIndex: number;
  /** True when an anchor lies within 60 s of the asked time. */
  synced: boolean;
}

/** Lowercase, curly apostrophes made straight, words = runs of [a-z0-9']. */
export function normalizeWords(text: string): string[] {
  return text.toLowerCase().replace(/[‘’ʼ]/g, "'").match(/[a-z0-9']+/g) ?? [];
}

/** Built once per book from the same paragraphs the reading view renders. */
export function buildBookIndex(paragraphs: { text: string }[]): BookIndex {
  const words: string[] = [];
  const paragraphOfWord: number[] = [];
  const firstWordOfParagraph: number[] = [];
  paragraphs.forEach((p, pi) => {
    firstWordOfParagraph.push(words.length);
    for (const w of normalizeWords(p.text)) {
      words.push(w);
      paragraphOfWord.push(pi);
    }
  });
  const pairPositions = new Map<string, number[]>();
  for (let i = 0; i + 1 < words.length; i++) {
    const key = `${words[i]} ${words[i + 1]}`;
    const list = pairPositions.get(key);
    if (list) list.push(i);
    else pairPositions.set(key, [i]);
  }
  return { words, paragraphOfWord, firstWordOfParagraph, pairPositions };
}

/** Groups segments (sorted by start) into 25 s windows; the grid restarts at each 600 s chunk. */
export function transcriptWindows(segments: SyncSegment[]): SyncSegment[][] {
  const windows: SyncSegment[][] = [];
  let currentKey = '';
  for (const seg of segments) {
    const chunk = Math.floor(seg.start / CHUNK_SEC);
    const slot = Math.floor((seg.start - chunk * CHUNK_SEC) / WINDOW_SEC);
    const key = `${chunk}:${slot}`;
    if (key !== currentKey) {
      windows.push([]);
      currentKey = key;
    }
    windows[windows.length - 1].push(seg);
  }
  return windows;
}

/**
 * Where in the book a window of transcript starts. Each word pair votes for the
 * 25-word bucket its book occurrences imply, at most once per bucket, so the
 * confidence (best bucket's votes / pairs) never exceeds 1.
 */
export function matchWindow(
  index: BookIndex,
  windowWords: string[],
): { wordIndex: number; pairs: number; confidence: number } | null {
  const pairs = windowWords.length - 1;
  if (pairs < 1) return null;
  const votes = new Map<number, number>();
  for (let i = 0; i < pairs; i++) {
    const positions = index.pairPositions.get(`${windowWords[i]} ${windowWords[i + 1]}`);
    if (!positions) continue;
    const seen = new Set<number>();
    for (const pos of positions) {
      const bucket = Math.floor((pos - i) / BUCKET_WORDS);
      if (bucket < 0 || seen.has(bucket)) continue;
      seen.add(bucket);
      votes.set(bucket, (votes.get(bucket) ?? 0) + 1);
    }
  }
  let bestBucket = -1;
  let bestVotes = 0;
  for (const [bucket, count] of votes) {
    if (count > bestVotes || (count === bestVotes && bucket < bestBucket)) {
      bestBucket = bucket;
      bestVotes = count;
    }
  }
  if (bestBucket < 0) return null;
  const wordIndex = Math.min(bestBucket * BUCKET_WORDS, Math.max(index.words.length - 1, 0));
  return { wordIndex, pairs, confidence: bestVotes / pairs };
}

/** Keeps the longest run of anchors (sorted by time) whose wordIndex strictly increases. */
export function longestIncreasing(anchors: SyncAnchor[]): SyncAnchor[] {
  // Patience sorting: tails[k] = index of the smallest tail of a run of length k + 1.
  const tails: number[] = [];
  const prev: number[] = new Array(anchors.length).fill(-1);
  anchors.forEach((a, i) => {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (anchors[tails[mid]].wordIndex < a.wordIndex) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0) prev[i] = tails[lo - 1];
    tails[lo] = i;
  });
  const out: SyncAnchor[] = [];
  for (let i = tails.length ? tails[tails.length - 1] : -1; i >= 0; i = prev[i]) out.push(anchors[i]);
  return out.reverse();
}

/** Automatic anchors from a transcript, in time order and increasing in the book. */
export function matchTranscript(index: BookIndex, segments: SyncSegment[]): SyncAnchor[] {
  const sorted = [...segments].sort((a, b) => a.start - b.start);
  const anchors: SyncAnchor[] = [];
  for (const window of transcriptWindows(sorted)) {
    const words = window.flatMap((seg) => normalizeWords(seg.text));
    const match = matchWindow(index, words);
    if (match && match.pairs >= MIN_PAIRS && match.confidence >= MIN_CONFIDENCE) {
      anchors.push({ timeSec: window[0].start, wordIndex: match.wordIndex });
    }
  }
  return longestIncreasing(anchors);
}

/**
 * Adds the user's manual anchors (at the first word of their paragraph). They
 * win over automatic anchors within 60 s. Anchors for paragraphs the book does
 * not have (another EPUB was chosen) are ignored.
 */
export function mergeManualAnchors(
  index: BookIndex,
  automatic: SyncAnchor[],
  manual: { timeSec: number; paragraphIndex: number }[],
): SyncAnchor[] {
  const lastWord = Math.max(index.words.length - 1, 0);
  const manualAnchors: SyncAnchor[] = manual
    .filter((m) => m.paragraphIndex >= 0 && m.paragraphIndex < index.firstWordOfParagraph.length)
    .map((m) => ({
      timeSec: m.timeSec,
      wordIndex: Math.min(index.firstWordOfParagraph[m.paragraphIndex], lastWord),
      manual: true,
    }));
  const kept = automatic.filter((a) => manualAnchors.every((m) => Math.abs(m.timeSec - a.timeSec) >= SYNCED_SEC));
  return [...kept, ...manualAnchors].sort((a, b) => a.timeSec - b.timeSec);
}

/** Words per second between two anchors, or null when they share a time. */
function rate(a: SyncAnchor, b: SyncAnchor): number | null {
  const dt = b.timeSec - a.timeSec;
  return dt > 0 ? (b.wordIndex - a.wordIndex) / dt : null;
}

/**
 * The paragraph being heard at `timeSec`, from anchors sorted by time.
 * Between anchors: linear interpolation. Outside them: extrapolation at the
 * rate of the two nearest anchors (2.5 words/s with one anchor). Returns null
 * only when there are no anchors.
 */
export function positionAt(index: BookIndex, anchors: SyncAnchor[], timeSec: number): SyncPosition | null {
  if (anchors.length === 0 || index.words.length === 0 || !Number.isFinite(timeSec)) return null;
  const first = anchors[0];
  const last = anchors[anchors.length - 1];

  let wordIndex: number;
  let nearestSec: number;
  if (timeSec < first.timeSec || timeSec > last.timeSec) {
    const before = timeSec < first.timeSec;
    const edge = before ? first : last;
    nearestSec = Math.abs(timeSec - edge.timeSec);
    const r = anchors.length > 1
      ? (before ? rate(anchors[0], anchors[1]) : rate(anchors[anchors.length - 2], last))
      : null;
    wordIndex = edge.wordIndex + (r ?? FALLBACK_WORDS_PER_SEC) * (timeSec - edge.timeSec);
  } else {
    // Last anchor at or before timeSec.
    let lo = 0;
    let hi = anchors.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (anchors[mid].timeSec <= timeSec) lo = mid;
      else hi = mid - 1;
    }
    const a = anchors[lo];
    const b = anchors[Math.min(lo + 1, anchors.length - 1)];
    const span = b.timeSec - a.timeSec;
    wordIndex = span > 0 ? a.wordIndex + ((b.wordIndex - a.wordIndex) * (timeSec - a.timeSec)) / span : a.wordIndex;
    nearestSec = Math.min(timeSec - a.timeSec, b.timeSec - timeSec);
  }

  const clamped = Math.min(Math.max(Math.round(wordIndex), 0), index.words.length - 1);
  return { paragraphIndex: index.paragraphOfWord[clamped], synced: nearestSec <= SYNCED_SEC };
}
