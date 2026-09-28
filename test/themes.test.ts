import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  normalizeSubjectLabel, normalizeThemes, themeVocabulary,
} from '../src/catalog/themes.js';

test('subject labels normalize Unicode, case, and whitespace without removing accents', () => {
  assert.equal(normalizeSubjectLabel(' Café '.normalize('NFD')), 'café');
  assert.equal(normalizeSubjectLabel(' Coming\u00a0of\u00a0age '), 'coming of age');
  assert.equal(normalizeSubjectLabel('FANTASY  fiction'), 'fantasy fiction');
});

test('explicit equivalent subjects map to deduplicated canonical themes', () => {
  assert.deepEqual(normalizeThemes([' Fantasy  fiction ', 'FANTASY', 'Dragons']), [
    { id: 'dragons', label: 'Dragons', specificity: 'specific' },
    { id: 'fantasy', label: 'Fantasy', specificity: 'broad' },
  ]);
  assert.deepEqual(normalizeThemes(['Dragons', 'Dragon', 'Unknown subject']), [
    { id: 'dragons', label: 'Dragons', specificity: 'specific' },
  ]);
  assert.deepEqual(normalizeThemes(['Coming\u00a0of\u00a0age']), [
    { id: 'coming-of-age', label: 'Coming of age', specificity: 'specific' },
  ]);
});

test('unknown and merely related subjects do not invent themes', () => {
  assert.deepEqual(normalizeThemes(['Fantasy creatures', 'Magical realism', '']), []);
  assert.deepEqual(normalizeThemes([]), []);
  assert.deepEqual(normalizeThemes(['Magic', 'Dragons']).map(({ id }) => id), ['dragons', 'magic']);
});

test('vocabulary aliases resolve unambiguously to their canonical themes', () => {
  const aliases = new Set<string>();
  for (const theme of themeVocabulary) {
    for (const alias of theme.aliases) {
      const normalized = normalizeSubjectLabel(alias);
      assert.ok(!aliases.has(normalized), `ambiguous alias: ${alias}`);
      aliases.add(normalized);
      assert.deepEqual(normalizeThemes([alias]), [{
        id: theme.id, label: theme.label, specificity: theme.specificity,
      }]);
    }
  }
});

test('normalization preserves its inputs and returns independent theme evidence', () => {
  const input = Object.freeze(['Dragon', 'Fantasy']);
  const result = normalizeThemes(input);
  assert.deepEqual(input, ['Dragon', 'Fantasy']);
  result[0]!.label = 'Changed by caller';
  assert.equal(normalizeThemes(['Dragon'])[0]?.label, 'Dragons');
});
