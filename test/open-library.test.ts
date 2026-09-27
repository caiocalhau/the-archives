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
    title: 'The Lord of the Rings',
    description: { type: '/type/text', value: 'Fantasy and romance' },
    first_publish_date: '1954',
    authors: [{ author: { key: '/authors/OL1A' } }],
    subjects: ['Fantasy', 'Adventure'],
  }));

  assert.deepEqual(normalizeWork(record), {
    id: '/works/OL1W',
    title: 'The Lord of the Rings',
    description: 'Fantasy and romance',
    firstPublishYear: 1954,
    authorIds: ['/authors/OL1A'],
    subjects: ['Fantasy', 'Adventure'],
    series: [],
  });
});

test('keeps string descriptions and does not invent missing descriptions', () => {
  const withDescription = parseDumpLine(dumpLine('/type/work', '/works/OL2W', {
    title: 'Book Two', description: 'Plain text',
  }));
  const withoutDescription = parseDumpLine(dumpLine('/type/work', '/works/OL3W', {
    title: 'Book Three',
  }));

  assert.equal(normalizeWork(withDescription)?.description, 'Plain text');
  assert.equal(normalizeWork(withoutDescription)?.description, null);
});

test('normalizes an edition with its parent work, language and explicit series number', () => {
  const record = parseDumpLine(dumpLine('/type/edition', '/books/OL1M', {
    title: 'The Lord of the Rings',
    works: [{ key: '/works/OL1W' }],
    languages: [{ key: '/languages/eng' }],
    series: ['Example Series #2'],
  }));

  assert.deepEqual(normalizeEdition(record), {
    id: '/books/OL1M',
    workId: '/works/OL1W',
    title: 'The Lord of the Rings',
    language: 'eng',
    series: [{ id: 'openlibrary:series:example series', name: 'Example Series', position: '2' }],
  });
});

test('normalizes an author and rejects malformed or mismatched records', () => {
  const record = parseDumpLine(dumpLine('/type/author', '/authors/OL1A', {
    name: 'Example Author',
  }));

  assert.deepEqual(normalizeAuthor(record), { id: '/authors/OL1A', name: 'Example Author' });
  assert.equal(normalizeWork(record), null);
  assert.equal(parseDumpLine('/type/work\t/works/OL1W\t1\tdate\t{not-json'), null);
  assert.equal(parseDumpLine('/type/work\t/works/OL1W'), null);
});
