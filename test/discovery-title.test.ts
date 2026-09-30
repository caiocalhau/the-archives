import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchesTitle } from '../src/catalog/discovery/title-match.js';

test('matches whole query words in a title or matching edition title', () => {
  assert.equal(matchesTitle('Garoto Cabra', ['O Garoto-Cabra']), true);
  assert.equal(matchesTitle('the hobbit', ['O Hobbit', 'The Hobbit']), true);
  assert.equal(matchesTitle('Ｆｏｕｒｔｈ Ｗｉｎｇ', ['Fourth Wing']), true);
  assert.equal(matchesTitle('  name, of   the wind! ', ['The Name of the Wind']), true);
});

test('preserves accents and requires a contiguous whole-word sequence', () => {
  assert.equal(matchesTitle('cafe', ['Café']), false);
  assert.equal(matchesTitle('café', ['Cafe']), false);
  assert.equal(matchesTitle('wind name', ['The Name of the Wind']), false);
  assert.equal(matchesTitle('cat', ['The Catacomb']), false);
  assert.equal(matchesTitle('', ['Any Book']), false);
  assert.equal(matchesTitle('...?', ['Any Book']), false);
});
