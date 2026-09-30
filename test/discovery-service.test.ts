import assert from 'node:assert/strict';
import { test } from 'node:test';
import { initializeCatalog, openCatalog } from '../src/catalog/db.js';
import { discoverBooks, inspectBook } from '../src/catalog/discovery/service.js';
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

function inspectedProvider(
  calls: string[],
  getResult: ProviderResult<BookRecord>,
  searchResult: ProviderResult<BookRecord[]> = { status: 'no_match', value: null },
): BookProvider {
  return {
    async search(title, authors) {
      calls.push(`search:${title}:${authors?.join(',') ?? ''}`);
      return searchResult;
    },
    async get(id) { calls.push(`get:${id}`); return getResult; },
  };
}

test('complete local details, including a broad subject, need no provider', async () => {
  const db = catalog();
  try {
    db.prepare('INSERT INTO subjects(id, label) VALUES (?, ?)').run('fiction', 'Fiction');
    db.prepare('INSERT INTO work_subjects(work_id, subject_id) VALUES (?, ?)')
      .run('/works/OL1W', 'fiction');
    const calls: string[] = [];
    const before = db.serialize();
    const result = await inspectBook(db, 'local', '/works/OL1W', {
      openlibrary: inspectedProvider(calls, { status: 'ok', value: openBook }),
      google: inspectedProvider(calls, { status: 'ok', value: googleBook }),
    });
    assert.equal(result?.selected?.description, 'A local story');
    assert.deepEqual(result?.selected?.subjects, ['Fiction']);
    assert.deepEqual(result?.providers, {
      openlibrary: { status: 'not_needed' }, google: { status: 'not_needed' },
    });
    assert.deepEqual(calls, []);
    assert.equal('recommendations' in (result ?? {}), false);
    assert.deepEqual(db.serialize(), before);
  } finally { db.close(); }
});

test('sparse local Open Library work displays same-source detail without overwriting local data', async () => {
  const db = catalog();
  try {
    db.prepare('UPDATE works SET description = NULL WHERE id = ?').run('/works/OL1W');
    const calls: string[] = [];
    const result = await inspectBook(db, 'local', '/works/OL1W', {
      openlibrary: inspectedProvider(calls, { status: 'ok', value: {
        ...openBook, id: '/works/OL1W', description: 'Provider description',
        subjects: ['Fantasy'],
      } }),
      google: inspectedProvider(calls, { status: 'ok', value: googleBook }),
    });
    assert.equal(result?.selected?.description, null);
    assert.equal(result?.sameSourceDetails?.description, 'Provider description');
    assert.deepEqual(result?.externalCandidates, []);
    assert.deepEqual(calls, ['get:/works/OL1W']);
    assert.equal(result?.providers.google.status, 'not_needed');
  } finally { db.close(); }
});

test('blank local description is missing and same-source text can complete it', async () => {
  const db = catalog();
  try {
    db.prepare('UPDATE works SET description = ? WHERE id = ?').run('   ', '/works/OL1W');
    db.prepare('INSERT INTO subjects(id, label) VALUES (?, ?)').run('fantasy', 'Fantasy');
    db.prepare('INSERT INTO work_subjects(work_id, subject_id) VALUES (?, ?)')
      .run('/works/OL1W', 'fantasy');
    const calls: string[] = [];
    const result = await inspectBook(db, 'local', '/works/OL1W', {
      openlibrary: inspectedProvider(calls, { status: 'ok', value: {
        ...openBook, id: '/works/OL1W', description: 'Provider description',
        subjects: ['Fantasy'],
      } }),
      google: inspectedProvider(calls, { status: 'ok', value: googleBook }),
    });
    assert.equal(result?.sameSourceDetails?.description, 'Provider description');
    assert.deepEqual(calls, ['get:/works/OL1W']);
  } finally { db.close(); }
});

test('remaining missing metadata searches Google but never merges its volume into the local work', async () => {
  const db = catalog();
  try {
    const calls: string[] = [];
    const result = await inspectBook(db, 'local', '/works/OL1W', {
      openlibrary: inspectedProvider(calls, { status: 'ok', value: openBook }),
      google: inspectedProvider(calls, { status: 'ok', value: googleBook },
        { status: 'ok', value: [googleBook] }),
    });
    assert.equal(result?.selected?.description, 'A local story');
    assert.deepEqual(result?.selected?.subjects, []);
    assert.deepEqual(result?.externalCandidates.map(({ id }) => id), ['vol1']);
    assert.deepEqual(calls, ['get:/works/OL1W', 'search:The Hobbit:']);
    assert.equal(result?.providers.google.status, 'ok');
  } finally { db.close(); }
});

test('a local non-Open-Library ID keeps searched matches separate and tries Google', async () => {
  const db = catalog();
  try {
    db.prepare('INSERT INTO works(id, title, source) VALUES (?, ?, ?)')
      .run('custom-1', 'Another Book', 'synthetic');
    const calls: string[] = [];
    const result = await inspectBook(db, 'local', 'custom-1', {
      openlibrary: inspectedProvider(calls, { status: 'ok', value: openBook },
        { status: 'ok', value: [openBook] }),
      google: inspectedProvider(calls, { status: 'ok', value: googleBook },
        { status: 'ok', value: [googleBook] }),
    });
    assert.equal(result?.selected?.id, 'custom-1');
    assert.equal(result?.sameSourceDetails, null);
    assert.deepEqual(result?.externalCandidates.map(({ source }) => source), [
      'openlibrary', 'google',
    ]);
    assert.deepEqual(calls, ['search:Another Book:', 'search:Another Book:']);
  } finally { db.close(); }
});

test('selected external books are inspectable by their own IDs without substitution', async () => {
  const db = catalog();
  try {
    const calls: string[] = [];
    const before = db.serialize();
    const providers = {
      openlibrary: inspectedProvider(calls, { status: 'ok', value: openBook }),
      google: inspectedProvider(calls, { status: 'ok', value: googleBook },
        { status: 'ok', value: [googleBook] }),
    };
    const openResult = await inspectBook(db, 'openlibrary', '/works/OL9W', providers);
    assert.equal(openResult?.selected?.source, 'openlibrary');
    assert.deepEqual(openResult?.externalCandidates.map(({ id }) => id), ['vol1']);
    assert.deepEqual(calls, ['get:/works/OL9W', 'search:The Hobbit:Tolkien']);
    calls.length = 0;
    const googleResult = await inspectBook(db, 'google', 'vol1', providers);
    assert.equal(googleResult?.selected?.source, 'google');
    assert.deepEqual(calls, ['get:vol1']);
    assert.equal(googleResult?.providers.openlibrary.status, 'not_needed');
    assert.deepEqual(db.serialize(), before);
  } finally { db.close(); }
});

test('unavailable external selection reports its source outcome; missing local ID remains unknown', async () => {
  const db = catalog();
  try {
    const providers = {
      openlibrary: inspectedProvider([], { status: 'error', value: null, errorKind: 'timeout' }),
      google: inspectedProvider([], { status: 'no_match', value: null }),
    };
    assert.equal(await inspectBook(db, 'local', '/works/missing', providers), null);
    const result = await inspectBook(db, 'openlibrary', '/works/OL9W', providers);
    assert.equal(result?.selected, null);
    assert.deepEqual(result?.externalCandidates, []);
    assert.deepEqual(result?.providers, {
      openlibrary: { status: 'error', errorKind: 'timeout' },
      google: { status: 'not_needed' },
    });
  } finally { db.close(); }
});
