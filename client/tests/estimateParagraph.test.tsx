import assert from 'node:assert/strict';
import { test } from 'node:test';
import { estimateParagraph } from '../src/utils/epub';

test('returns -1 when there are no paragraphs', () => {
  assert.equal(estimateParagraph(0.5, []), -1);
});

test('maps the start and the end to the first and last paragraph', () => {
  assert.equal(estimateParagraph(0, [10, 20, 30]), 0);
  assert.equal(estimateParagraph(1, [10, 20, 30]), 2);
});

test('clamps fractions outside 0–1 and ignores NaN', () => {
  assert.equal(estimateParagraph(-0.5, [10, 20, 30]), 0);
  assert.equal(estimateParagraph(1.5, [10, 20, 30]), 2);
  assert.equal(estimateParagraph(Number.NaN, [10, 20, 30]), 0);
});

test('always picks the only paragraph', () => {
  assert.equal(estimateParagraph(0, [42]), 0);
  assert.equal(estimateParagraph(0.5, [42]), 0);
  assert.equal(estimateParagraph(1, [42]), 0);
});

test('weights the position by character count', () => {
  // Characters 0–9 are paragraph 0, 10–89 paragraph 1, 90–99 paragraph 2.
  assert.equal(estimateParagraph(0.05, [10, 80, 10]), 0);
  assert.equal(estimateParagraph(0.1, [10, 80, 10]), 1);
  assert.equal(estimateParagraph(0.5, [10, 80, 10]), 1);
  assert.equal(estimateParagraph(0.95, [10, 80, 10]), 2);
});
