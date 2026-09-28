import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  rankRecommendations, type RecommendationWork,
} from '../src/catalog/recommendations.js';

function work(id: string, overrides: Partial<RecommendationWork> = {}): RecommendationWork {
  return { id, title: id, subjects: [], authorIds: [], seriesIds: [], ...overrides };
}

const source = work('/works/source', {
  subjects: ['Fantasy', 'Magic', 'Dragons'],
  authorIds: ['/authors/A', '/authors/B'],
  seriesIds: ['/series/source'],
});

const candidates = [
  work('/works/two-themes', { subjects: ['Magic', 'Dragons'], authorIds: ['/authors/C'] }),
  work('/works/same-author', { subjects: ['Fantasy', 'Magic'], authorIds: ['/authors/A', '/authors/B'] }),
  work('/works/tie-b', { subjects: ['Dragons'], authorIds: ['/authors/C'] }),
  work('/works/tie-a', { subjects: ['Dragons'], authorIds: ['/authors/C'] }),
  work('/works/broad-only', { subjects: ['Fantasy'], authorIds: ['/authors/A'] }),
  work('/works/author-only', { subjects: ['Unknown'], authorIds: ['/authors/A'] }),
  work('/works/series-member', {
    subjects: ['Magic', 'Dragons'], authorIds: ['/authors/A'], seriesIds: ['/series/source'],
  }),
  source,
];

test('recommendations rank thematic evidence and cap authorship at one point', () => {
  assert.deepEqual(rankRecommendations(source, candidates, 10), [
    {
      id: '/works/two-themes', title: '/works/two-themes', score: 6,
      sharedThemes: [
        { id: 'dragons', label: 'Dragons', weight: 3 },
        { id: 'magic', label: 'Magic', weight: 3 },
      ],
      sharedAuthorIds: [],
    },
    {
      id: '/works/same-author', title: '/works/same-author', score: 5,
      sharedThemes: [
        { id: 'fantasy', label: 'Fantasy', weight: 1 },
        { id: 'magic', label: 'Magic', weight: 3 },
      ],
      sharedAuthorIds: ['/authors/A', '/authors/B'],
    },
    {
      id: '/works/tie-a', title: '/works/tie-a', score: 3,
      sharedThemes: [{ id: 'dragons', label: 'Dragons', weight: 3 }], sharedAuthorIds: [],
    },
    {
      id: '/works/tie-b', title: '/works/tie-b', score: 3,
      sharedThemes: [{ id: 'dragons', label: 'Dragons', weight: 3 }], sharedAuthorIds: [],
    },
  ]);
});

test('recommendations require a specific connection rather than only broad themes or authors', () => {
  assert.deepEqual(rankRecommendations(source, [
    work('/works/broad', { subjects: ['Fantasy', 'Adventure', 'Fiction'], authorIds: ['/authors/A'] }),
    work('/works/author', { authorIds: ['/authors/A'] }),
    work('/works/unrelated', { subjects: ['Vampires'] }),
    work('/works/unmapped', { subjects: ['Magical realism'] }),
  ], 10), []);
});

test('recommendations exclude self and any known shared series', () => {
  assert.deepEqual(rankRecommendations(source, [
    source,
    work('/works/same-series', { subjects: ['Magic'], seriesIds: ['/series/other', '/series/source'] }),
  ], 10), []);
  assert.equal(rankRecommendations(source, [
    work('/works/other-series', { subjects: ['Magic'], seriesIds: ['/series/other'] }),
  ], 10).length, 1);
});

test('duplicate aliases and author IDs do not inflate scores or explanations', () => {
  const duplicatedSource = work('/works/source', {
    subjects: ['Fantasy fiction', 'FANTASY', 'Dragon', 'Dragons'],
    authorIds: ['/authors/A', '/authors/A'],
  });
  const result = rankRecommendations(duplicatedSource, [work('/works/other', {
    subjects: ['Fantasy', 'Fantasy fiction', 'DRAGONS', 'Dragon'],
    authorIds: ['/authors/A', '/authors/A'],
  })], 10);
  assert.deepEqual(result, [{
    id: '/works/other', title: '/works/other', score: 5,
    sharedThemes: [
      { id: 'dragons', label: 'Dragons', weight: 3 },
      { id: 'fantasy', label: 'Fantasy', weight: 1 },
    ],
    sharedAuthorIds: ['/authors/A'],
  }]);
});

test('missing optional evidence returns fewer results without inventing metadata', () => {
  assert.deepEqual(rankRecommendations(work('/works/sparse'), candidates, 10), []);
  assert.deepEqual(rankRecommendations(source, [work('/works/sparse')], 10), []);
  assert.deepEqual(rankRecommendations(source, [], 10), []);
  assert.deepEqual(rankRecommendations(work('/works/source', { subjects: ['Magic'] }), [
    work('/works/other', { subjects: ['Magic'] }),
  ], 10), [{
    id: '/works/other', title: '/works/other', score: 3,
    sharedThemes: [{ id: 'magic', label: 'Magic', weight: 3 }], sharedAuthorIds: [],
  }]);
});

test('ordering is independent of candidate order and limits apply after ranking', () => {
  assert.deepEqual(rankRecommendations(source, [...candidates].reverse(), 10),
    rankRecommendations(source, candidates, 10));
  assert.deepEqual(rankRecommendations(source, candidates, 1).map(({ id }) => id), ['/works/two-themes']);
});

test('invalid recommendation limits are rejected even without candidates', () => {
  for (const limit of [0, -1, 1.5, NaN, Infinity]) {
    assert.throws(() => rankRecommendations(source, [], limit), /limit/i);
  }
});

test('ranking leaves inputs unchanged and results do not share input arrays', () => {
  const before = structuredClone({ source, candidates });
  const result = rankRecommendations(source, candidates, 10);
  assert.deepEqual({ source, candidates }, before);
  result[1]!.sharedAuthorIds.push('/authors/new');
  result[1]!.sharedThemes[0]!.label = 'Changed by caller';
  assert.deepEqual({ source, candidates }, before);
  assert.equal(rankRecommendations(source, candidates, 10)[1]?.sharedThemes[0]?.label, 'Fantasy');
});
