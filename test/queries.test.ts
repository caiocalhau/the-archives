import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { initializeCatalog, openCatalog } from '../src/catalog/db.js';
import { importCatalog } from '../src/catalog/import.js';
import { getWorkDetails, searchWorksByTitle } from '../src/catalog/queries.js';
import * as catalogQueries from '../src/catalog/queries.js';
import { seedRecommendationCatalog } from './fixtures/recommendation-catalog.js';

const fixtures = fileURLToPath(new URL('./fixtures/', import.meta.url));
const projectRoot = fileURLToPath(new URL('../', import.meta.url));

function fixtureOptions(dbPath: string) {
  return {
    dbPath,
    worksPath: join(fixtures, 'works.tsv'),
    editionsPath: join(fixtures, 'editions.tsv'),
    authorsPath: join(fixtures, 'authors.tsv'),
    selectionPath: join(fixtures, 'selection.txt'),
  };
}

test('title search resolves editions to one work and ignores case and Latin accents', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'the-archives-query-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const dbPath = join(directory, 'catalog.db');
  await importCatalog(fixtureOptions(dbPath));
  const db = openCatalog(dbPath);
  try {
    db.prepare('INSERT INTO editions(id, work_id, title) VALUES (?, ?, ?)')
      .run('/books/OL1M2', '/works/OL1W', 'The Lord of the Rings: Revised Edition');
    db.prepare('INSERT INTO work_titles(work_id, title) VALUES (?, ?)')
      .run('/works/OL1W', 'The Lord of the Rings: Revised Edition');
    assert.deepEqual(searchWorksByTitle(db, 'LORD OF THE RINGS', 10), [
      { id: '/works/OL1W', title: 'The Lord of the Rings' },
    ]);
    assert.deepEqual(searchWorksByTitle(db, 'Café'.normalize('NFD'), 10), [
      { id: '/works/OL2W', title: 'The Café Garden' },
    ]);
    assert.deepEqual(searchWorksByTitle(db, 'fellowship of the ring', 10).map((work) => work.id), [
      '/works/OL1W',
    ]);
    assert.deepEqual(searchWorksByTitle(db, 'cafe garden', 10).map((work) => work.id), [
      '/works/OL2W',
    ]);
    assert.deepEqual(searchWorksByTitle(db, '', 10), []);
    assert.throws(() => searchWorksByTitle(db, 'garden', 0), /limit/i);
  } finally {
    db.close();
  }
});

test('work details return known relations and leave missing data absent', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'the-archives-detail-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const dbPath = join(directory, 'catalog.db');
  await importCatalog(fixtureOptions(dbPath));
  const db = openCatalog(dbPath);
  try {
    assert.deepEqual(getWorkDetails(db, '/works/OL1W'), {
      id: '/works/OL1W',
      title: 'The Lord of the Rings',
      description: 'Fantasy and adventure in an imaginary world.',
      authors: ['Example Author'],
      editions: [{ id: '/books/OL1M', title: 'The Fellowship of the Ring', language: 'eng' }],
      subjects: ['Adventure', 'Fantasy'],
      series: [{ id: 'openlibrary:series:the lord of the rings', name: 'The Lord of the Rings', position: '1' }],
    });
    assert.equal(getWorkDetails(db, '/works/OL2W')?.description, null);
    assert.deepEqual(getWorkDetails(db, '/works/OL2W')?.subjects, []);
    assert.equal(getWorkDetails(db, '/works/missing'), null);
  } finally {
    db.close();
  }
});

test('CLI imports, searches and shows a work with JSON output', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'the-archives-cli-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const dbPath = join(directory, 'catalog.db');
  const run = (...args: string[]) => spawnSync(
    process.execPath,
    ['--import', 'tsx', 'src/cli.ts', ...args],
    { cwd: projectRoot, encoding: 'utf8' },
  );
  const imported = run('import', '--works', join(fixtures, 'works.tsv'), '--editions',
    join(fixtures, 'editions.tsv'), '--authors', join(fixtures, 'authors.tsv'),
    '--selection', join(fixtures, 'selection.txt'), '--db', dbPath);
  assert.ifError(imported.error);
  assert.equal(imported.status, 0, imported.stderr);
  assert.equal(JSON.parse(imported.stdout).works, 2);

  const search = run('search', 'lord of the rings', '--db', dbPath);
  assert.ifError(search.error);
  assert.equal(search.status, 0, search.stderr);
  assert.deepEqual(JSON.parse(search.stdout).map((work: { id: string }) => work.id), ['/works/OL1W']);

  const show = run('show', '/works/OL1W', '--db', dbPath);
  assert.ifError(show.error);
  assert.equal(show.status, 0, show.stderr);
  assert.equal(JSON.parse(show.stdout).series[0].position, '1');

  const missing = run('show', '/works/missing', '--db', dbPath);
  assert.ifError(missing.error);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /not found/i);
});

test('catalog recommendations use author IDs and return one result per work', () => {
  const db = openCatalog(':memory:');
  try {
    initializeCatalog(db);
    seedRecommendationCatalog(db);
    const detailsBefore = getWorkDetails(db, '/works/source');
    const subjectsBefore = db.prepare('SELECT * FROM subjects ORDER BY id').all();
    const results = catalogQueries.recommendWorks(db, '/works/source', 10);
    assert.deepEqual(results?.map(({ id }) => id), [
      '/works/two-themes', '/works/same-author', '/works/same-name',
    ]);
    assert.deepEqual(results?.map(({ score }) => score), [6, 5, 4]);
    assert.deepEqual(results?.[1]?.sharedAuthorIds, ['/authors/A']);
    assert.deepEqual(results?.[2]?.sharedAuthorIds, []);
    assert.equal(results?.filter(({ id }) => id === '/works/two-themes').length, 1);
    assert.deepEqual(getWorkDetails(db, '/works/source'), detailsBefore);
    assert.deepEqual(db.prepare('SELECT * FROM subjects ORDER BY id').all(), subjectsBefore);
    assert.equal(getWorkDetails(db, '/works/two-themes')?.description, null);
    assert.deepEqual(catalogQueries.recommendWorks(db, '/works/source', 1)?.map(({ id }) => id), [
      '/works/two-themes',
    ]);
  } finally {
    db.close();
  }
});

test('catalog recommendations distinguish sparse known works from missing works', () => {
  const db = openCatalog(':memory:');
  try {
    initializeCatalog(db);
    seedRecommendationCatalog(db);
    assert.deepEqual(catalogQueries.recommendWorks(db, '/works/sparse', 10), []);
    assert.equal(catalogQueries.recommendWorks(db, '/works/missing', 10), null);
  } finally {
    db.close();
  }
});

test('catalog recommendation limits are validated even for unknown works', () => {
  const db = openCatalog(':memory:');
  try {
    initializeCatalog(db);
    for (const limit of [0, -1, 1.5, NaN, Infinity]) {
      assert.throws(() => catalogQueries.recommendWorks(db, '/works/missing', limit), /limit/i);
    }
  } finally {
    db.close();
  }
});
