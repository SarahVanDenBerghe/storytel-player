import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildBookIndex,
  longestIncreasing,
  matchTranscript,
  matchWindow,
  mergeManualAnchors,
  normalizeWords,
  positionAt,
  timeAtParagraph,
  wordPositionAt,
} from '../src/utils/readAlongSync';

// 10 paragraphs of 10 distinct words each: word n is "wn", paragraph p holds words 10p–10p+9.
const paragraphs = Array.from({ length: 10 }, (_, p) => ({
  text: Array.from({ length: 10 }, (_, k) => `w${p * 10 + k}`).join(' '),
}));
const index = buildBookIndex(paragraphs);

test('normalises case, punctuation and curly apostrophes', () => {
  assert.deepEqual(normalizeWords('“Don’t,” she SAID — 42 times.'), ["don't", 'she', 'said', '42', 'times']);
});

test('indexes words, their paragraphs and word pairs', () => {
  assert.equal(index.words.length, 100);
  assert.equal(index.paragraphOfWord[25], 2);
  assert.equal(index.firstWordOfParagraph[3], 30);
  assert.deepEqual(index.pairPositions.get('w4 w5'), [4]);
});

test('counts a bucket at most once per pair, so confidence never exceeds 100%', () => {
  // "a b" occurs three times inside the same 25-word bucket.
  const repeated = buildBookIndex([{ text: 'a b a b a b c d e f' }]);
  const match = matchWindow(repeated, ['a', 'b']);
  assert.ok(match);
  assert.equal(match.pairs, 1);
  assert.equal(match.confidence, 1);
});

test('matches a window to the exact word it starts on, not its bucket start', () => {
  const words = Array.from({ length: 20 }, (_, k) => `w${53 + k}`);
  const match = matchWindow(index, words);
  assert.ok(match);
  assert.equal(match.wordIndex, 53);
  assert.equal(match.confidence, 1);
});

test('finds the exact start when a window straddles a bucket boundary', () => {
  const words = Array.from({ length: 20 }, (_, k) => `w${70 + k}`);
  const match = matchWindow(index, words);
  assert.ok(match);
  assert.equal(match.wordIndex, 70);
});

test('keeps confident windows as anchors at their first segment start', () => {
  const segments = [
    { start: 0, end: 10, text: Array.from({ length: 12 }, (_, k) => `w${k}`).join(' ') },
    { start: 30, end: 40, text: Array.from({ length: 12 }, (_, k) => `w${50 + k}`).join(' ') },
    // Too few pairs to count.
    { start: 60, end: 62, text: 'w80 w81 w82' },
  ];
  assert.deepEqual(matchTranscript(index, segments), [
    { timeSec: 0, wordIndex: 0 },
    { timeSec: 30, wordIndex: 50 },
  ]);
});

test('drops an out-of-order anchor', () => {
  const kept = longestIncreasing([
    { timeSec: 0, wordIndex: 0 },
    { timeSec: 25, wordIndex: 50 },
    { timeSec: 50, wordIndex: 900 },
    { timeSec: 75, wordIndex: 100 },
    { timeSec: 100, wordIndex: 150 },
  ]);
  assert.deepEqual(kept.map((a) => a.timeSec), [0, 25, 75, 100]);
});

test('returns null without anchors', () => {
  assert.equal(positionAt(index, [], 10), null);
});

test('interpolates between anchors', () => {
  const anchors = [
    { timeSec: 100, wordIndex: 0 },
    { timeSec: 200, wordIndex: 80 },
  ];
  // Halfway: word 40 → paragraph 4; 50 s from both anchors, so synced.
  assert.deepEqual(positionAt(index, anchors, 150), { paragraphIndex: 4, synced: true });
});

test('is synced only within 60 s of an anchor', () => {
  const anchors = [
    { timeSec: 0, wordIndex: 0 },
    { timeSec: 400, wordIndex: 80 },
  ];
  assert.equal(positionAt(index, anchors, 60)?.synced, true);
  // 200 s from both: still interpolated, but not synced.
  assert.deepEqual(positionAt(index, anchors, 200), { paragraphIndex: 4, synced: false });
});

test('extrapolates at the rate of the nearest two anchors, unsynced beyond 60 s', () => {
  const anchors = [
    { timeSec: 100, wordIndex: 10 },
    { timeSec: 110, wordIndex: 20 }, // 1 word/s
  ];
  assert.deepEqual(positionAt(index, anchors, 150), { paragraphIndex: 6, synced: true });
  assert.deepEqual(positionAt(index, anchors, 185), { paragraphIndex: 9, synced: false });
  assert.deepEqual(positionAt(index, anchors, 40), { paragraphIndex: 0, synced: true }); // clamped to word 0
  // Far outside the anchored range: still extrapolated (clamped to the book), never null.
  assert.deepEqual(positionAt(index, anchors, 201), { paragraphIndex: 9, synced: false });
  assert.deepEqual(positionAt(index, anchors, 9), { paragraphIndex: 0, synced: false });
});

test('extrapolates a single anchor at 2.5 words/s', () => {
  const anchors = [{ timeSec: 100, wordIndex: 10 }];
  // 10 + 2.5 * 20 = 60 → paragraph 6.
  assert.deepEqual(positionAt(index, anchors, 120), { paragraphIndex: 6, synced: true });
});

test('a manual anchor wins over automatic anchors within 60 s', () => {
  const automatic = [
    { timeSec: 0, wordIndex: 0 },
    { timeSec: 100, wordIndex: 25 },
    { timeSec: 300, wordIndex: 75 },
  ];
  const merged = mergeManualAnchors(index, automatic, [{ timeSec: 130, paragraphIndex: 4 }]);
  assert.deepEqual(merged, [
    { timeSec: 0, wordIndex: 0 },
    { timeSec: 130, wordIndex: 40, manual: true },
    { timeSec: 300, wordIndex: 75 },
  ]);
  assert.deepEqual(positionAt(index, merged, 130), { paragraphIndex: 4, synced: true });
});

test('ignores manual anchors for paragraphs the book does not have', () => {
  assert.deepEqual(mergeManualAnchors(index, [], [{ timeSec: 10, paragraphIndex: 99 }]), []);
});

test('finds the audio time where a paragraph starts, only inside the synced range', () => {
  // 10 words per paragraph; anchors: word 0 at 0 s, word 50 at 20 s, word 90 at 36 s (2.5 words/s).
  const anchors = [
    { timeSec: 0, wordIndex: 0 },
    { timeSec: 20, wordIndex: 50 },
    { timeSec: 36, wordIndex: 90 },
  ];
  assert.equal(timeAtParagraph(index, anchors, 0), 0);
  assert.equal(timeAtParagraph(index, anchors, 3), 12);
  assert.equal(timeAtParagraph(index, anchors, 7), 28);
  // Too few anchors to know the pace: no jump.
  assert.equal(timeAtParagraph(index, anchors.slice(0, 1), 3), null);
  // Far beyond the last anchor (word 90 + 300 words at 2.5 words/s = 120 s later): no jump.
  const big = buildBookIndex(Array.from({ length: 50 }, (_, p) => ({
    text: Array.from({ length: 10 }, (_, k) => `x${p * 10 + k}`).join(' '),
  })));
  assert.equal(timeAtParagraph(big, anchors, 39), null);
});

test('word position: null without anchors', () => {
  assert.equal(wordPositionAt(index, [], 10), null);
});

test('word position: interpolates a fractional word between anchors', () => {
  const anchors = [
    { timeSec: 100, wordIndex: 20 },
    { timeSec: 110, wordIndex: 30 }, // 1 word/s
  ];
  const position = wordPositionAt(index, anchors, 100.4);
  assert.ok(position);
  assert.ok(Math.abs(position.wordIndex - 20.4) < 1e-9);
  assert.equal(position.synced, true);
  // positionAt is the same position rounded to a word: 20.4 → word 20 → paragraph 2.
  assert.deepEqual(positionAt(index, anchors, 100.4), { paragraphIndex: 2, synced: true });
});

test('word position: extrapolates past the last anchor and clamps to the book', () => {
  const anchors = [
    { timeSec: 100, wordIndex: 10 },
    { timeSec: 110, wordIndex: 20 }, // 1 word/s
  ];
  assert.ok(Math.abs(wordPositionAt(index, anchors, 135.5)!.wordIndex - 45.5) < 1e-9);
  assert.deepEqual(wordPositionAt(index, anchors, 500), { wordIndex: 99, synced: false });
  assert.deepEqual(wordPositionAt(index, anchors, 0), { wordIndex: 0, synced: false });
  // One anchor: 2.5 words/s.
  assert.equal(wordPositionAt(index, [{ timeSec: 100, wordIndex: 10 }], 101)!.wordIndex, 12.5);
});
