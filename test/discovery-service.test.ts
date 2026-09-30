import assert from 'node:assert/strict';
import { test } from 'node:test';
import { initializeCatalog, openCatalog } from '../src/catalog/db.js';
import { discoverBooks } from '../src/catalog/discovery/service.js';
import type { BookProvider, BookRecord, ProviderResult } from '../src/catalog/discovery/types.js';

const openBook: BookRecord = {
  source: 'openlibrary', id: '/works/OL9W', title: 'The Hobbit',
  authors: ['Tolkien'], description: null, subjects: [],
  url: 'https://openlibrary.org/works/OL9W',
};
const googleBook: BookRecord = {
  source: 'google', id: 'vol1', title: 'The Hobbit',
  authors: ['Tolkien'], description: 'A story', subjects: ['Fantasy'],
  url: 'https://books.google.com/books?id=vol1',
};

function provider(result: ProviderResult<BookRecord[]>, calls: string[]): BookProvider {
  return {
    async search(title) { calls.push(title); return result; },
    async get() { throw new Error('get should not run during discovery'); },
  };
}

function catalog() {
  const db = openCatalog(':memory:');
  initializeCatalog(db);
  db.prepare('INSERT INTO works(id, title, description, source) VALUES (?, ?, ?, ?)')
    .run('/works/OL1W', 'The Hobbit', 'A local story', 'openlibrary');
  db.prepare('INSERT INTO work_titles(work_id, title) VALUES (?, ?)')
    .run('/works/OL1W', 'The Hobbit');
  return db;
}

test('a local title hit wins without contacting either provider', async () => {
  const db = catalog();
  try {
    const openCalls: string[] = [];
    const googleCalls: string[] = [];
    const before = db.serialize();
    const result = await discoverBooks(db, 'The Hobbit', {
      openlibrary: provider({ status: 'ok', value: [openBook] }, openCalls),
      google: provider({ status: 'ok', value: [googleBook] }, googleCalls),
    });
    assert.deepEqual(result.candidates, [{
      source: 'local', id: '/works/OL1W', title: 'The Hobbit',
      authors: [], description: 'A local story', subjects: [],
      url: 'https://openlibrary.org/works/OL1W',
    }]);
    assert.deepEqual(result.providers, {
      openlibrary: { status: 'not_needed' }, google: { status: 'not_needed' },
    });
    assert.deepEqual(openCalls, []);
    assert.deepEqual(googleCalls, []);
    assert.deepEqual(db.serialize(), before);
  } finally { db.close(); }
});

test('Open Library hit stops discovery before Google', async () => {
  const db = catalog();
  try {
    const openCalls: string[] = [];
    const googleCalls: string[] = [];
    const result = await discoverBooks(db, 'A Different Title', {
      openlibrary: provider({ status: 'ok', value: [openBook] }, openCalls),
      google: provider({ status: 'ok', value: [googleBook] }, googleCalls),
    });
    assert.deepEqual(result.candidates.map(({ id }) => id), ['/works/OL9W']);
    assert.deepEqual(result.providers, {
      openlibrary: { status: 'ok' }, google: { status: 'not_needed' },
    });
    assert.deepEqual(openCalls, ['A Different Title']);
    assert.deepEqual(googleCalls, []);
  } finally { db.close(); }
});

test('an Open Library miss falls back to Google and preserves provider outcomes', async () => {
  const db = catalog();
  try {
    const result = await discoverBooks(db, 'Unknown Book', {
      openlibrary: provider({ status: 'no_match', value: null }, []),
      google: provider({ status: 'ok', value: [googleBook] }, []),
    });
    assert.deepEqual(result.candidates.map(({ source, id }) => ({ source, id })), [
      { source: 'google', id: 'vol1' },
    ]);
    assert.deepEqual(result.providers, {
      openlibrary: { status: 'no_match' }, google: { status: 'ok' },
    });
  } finally { db.close(); }
});

test('a provider error does not prevent fallback or leak error details', async () => {
  const db = catalog();
  try {
    const result = await discoverBooks(db, 'Unknown Book', {
      openlibrary: provider({ status: 'error', value: null, errorKind: 'timeout' }, []),
      google: provider({ status: 'skipped', value: null }, []),
    });
    assert.deepEqual(result.candidates, []);
    assert.deepEqual(result.providers, {
      openlibrary: { status: 'error', errorKind: 'timeout' }, google: { status: 'skipped' },
    });
  } finally { db.close(); }
});

test('service bounds and deduplicates external candidates without merging sources', async () => {
  const db = catalog();
  try {
    const many = Array.from({ length: 7 }, (_, index) => ({
      ...openBook, id: `/works/OL${index + 10}W`,
    }));
    const result = await discoverBooks(db, 'Unknown Book', {
      openlibrary: provider({ status: 'ok', value: [many[0]!, many[0]!, ...many] }, []),
      google: provider({ status: 'ok', value: [googleBook] }, []),
    });
    assert.deepEqual(result.candidates.map(({ id }) => id), [
      '/works/OL10W', '/works/OL11W', '/works/OL12W', '/works/OL13W', '/works/OL14W',
    ]);
    assert.equal(result.providers.google.status, 'not_needed');
  } finally { db.close(); }
});
