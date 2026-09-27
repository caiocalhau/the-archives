import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  normalizeAuthor,
  normalizeEdition,
  normalizeWork,
  parseDumpLine,
} from '../src/catalog/open-library.js';

function dumpLine(type: string, key: string, data: Record<string, unknown>): string {
  return [type, key, '1', '2026-09-01T00:00:00Z', JSON.stringify(data)].join('\t');
}

test('normalizes a work with object-form description and source references', () => {
  const record = parseDumpLine(dumpLine('/type/work', '/works/OL1W', {
    title: 'O Senhor dos Anéis',
    description: { type: '/type/text', value: 'Fantasia e romance' },
    first_publish_date: '1954',
    authors: [{ author: { key: '/authors/OL1A' } }],
    subjects: ['Fantasy', 'Adventure'],
  }));

  assert.deepEqual(normalizeWork(record), {
    id: '/works/OL1W',
    title: 'O Senhor dos Anéis',
    description: 'Fantasia e romance',
    firstPublishYear: 1954,
    authorIds: ['/authors/OL1A'],
    subjects: ['Fantasy', 'Adventure'],
    series: [],
  });
});

test('keeps string descriptions and does not invent missing descriptions', () => {
  const withDescription = parseDumpLine(dumpLine('/type/work', '/works/OL2W', {
    title: 'Livro Dois', description: 'Texto simples',
  }));
  const withoutDescription = parseDumpLine(dumpLine('/type/work', '/works/OL3W', {
    title: 'Livro Três',
  }));

  assert.equal(normalizeWork(withDescription)?.description, 'Texto simples');
  assert.equal(normalizeWork(withoutDescription)?.description, null);
});

test('normalizes an edition with its parent work, language and explicit series number', () => {
  const record = parseDumpLine(dumpLine('/type/edition', '/books/OL1M', {
    title: 'O Senhor dos Aneis',
    works: [{ key: '/works/OL1W' }],
    languages: [{ key: '/languages/por' }],
    series: ['Saga Exemplo #2'],
  }));

  assert.deepEqual(normalizeEdition(record), {
    id: '/books/OL1M',
    workId: '/works/OL1W',
    title: 'O Senhor dos Aneis',
    language: 'por',
    series: [{ id: 'openlibrary:series:saga exemplo', name: 'Saga Exemplo', position: '2' }],
  });
});

test('normalizes an author and rejects malformed or mismatched records', () => {
  const record = parseDumpLine(dumpLine('/type/author', '/authors/OL1A', {
    name: 'Autora Exemplo',
  }));

  assert.deepEqual(normalizeAuthor(record), { id: '/authors/OL1A', name: 'Autora Exemplo' });
  assert.equal(normalizeWork(record), null);
  assert.equal(parseDumpLine('/type/work\t/works/OL1W\t1\tdate\t{not-json'), null);
  assert.equal(parseDumpLine('/type/work\t/works/OL1W'), null);
});
