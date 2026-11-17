import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanBookTitle } from '../src/utils/helpers';

test('drops the edition tag and extracts the part number', () => {
  assert.deepEqual(
    cleanBookTitle('A Court of Thorns and Roses (1 of 2) [Dramatized Adaptation]: A Court of Thorns and Roses 1'),
    { title: 'A Court of Thorns and Roses', part: { n: 1, total: 2 } },
  );
});

test('keeps colons before an edition tag', () => {
  assert.deepEqual(
    cleanBookTitle('Red Rising: Sons of Ares: Volume 1 [Dramatized Adaptation]: Red Rising: Sons of Ares 1'),
    { title: 'Red Rising: Sons of Ares: Volume 1' },
  );
});

test('cuts the subtitle after the first colon when there is no tag', () => {
  assert.deepEqual(
    cleanBookTitle('Dark Matter: The compulsive alternate-universe thriller, now on Apple TV+'),
    { title: 'Dark Matter' },
  );
  assert.deepEqual(cleanBookTitle('11/22/63: A Novel'), { title: '11/22/63' });
});

test('leaves a plain title unchanged', () => {
  assert.deepEqual(cleanBookTitle('The Mist'), { title: 'The Mist' });
});
