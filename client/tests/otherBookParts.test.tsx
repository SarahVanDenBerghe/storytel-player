import assert from 'node:assert/strict';
import { test } from 'node:test';
import { otherBookParts } from '../src/utils/helpers';
import { BookShelfEntity } from '../src/interfaces/books';

const entry = (id: string, name: string, author = 'Pierce Brown') =>
  ({ id, book: { name, authorsAsString: author } }) as unknown as BookShelfEntity;

const part1 = entry('1', 'Golden Son (1 of 2) [Dramatized Adaptation]: Red Rising Saga 2');
const part2 = entry('2', 'Golden Son (2 of 2) [Dramatized Adaptation]: Red Rising Saga 2');
const otherBook = entry('3', 'Morning Star (1 of 2) [Dramatized Adaptation]: Red Rising Saga 3');
const otherAuthor = entry('4', 'Golden Son (2 of 2) [Dramatized Adaptation]: Red Rising Saga 2', 'Someone Else');
const otherEdition = entry('5', 'Golden Son (2 of 3) [Dramatized Adaptation]: Red Rising Saga 2');

test('finds the other parts of a multi-part book on the shelf', () => {
  const shelf = [part1, part2, otherBook, otherAuthor, otherEdition];
  assert.deepEqual(otherBookParts(part1, shelf).map((b) => b.id), ['2']);
  assert.deepEqual(otherBookParts(part2, shelf).map((b) => b.id), ['1']);
});

test('a single-part book has no other parts', () => {
  assert.deepEqual(otherBookParts(entry('6', 'Red Rising'), [part1, part2]), []);
});
