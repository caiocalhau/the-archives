import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { gzipSync } from 'node:zlib';
import type Database from 'better-sqlite3';
import { openCatalog } from '../src/catalog/db.js';
import { importCatalog } from '../src/catalog/import.js';

const fixtures = fileURLToPath(new URL('./fixtures/', import.meta.url));

function countRows(db: Database.Database, table: string): number {
  return (db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count;
}

test('imports selected works and their relations without duplicating a repeated import', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'the-archives-import-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const dbPath = join(directory, 'catalog.db');
  const options = {
    dbPath,
    worksPath: join(fixtures, 'works.tsv'),
    editionsPath: join(fixtures, 'editions.tsv'),
    authorsPath: join(fixtures, 'authors.tsv'),
    selectionPath: join(fixtures, 'selection.txt'),
  };

  const first = await importCatalog(options);
  assert.deepEqual(first, {
    works: 2,
    editions: 2,
    authors: 2,
    malformed: 1,
    skipped: 1,
  });

  const db = openCatalog(dbPath);
  try {
    assert.equal(countRows(db, 'works'), 2);
    assert.equal(countRows(db, 'editions'), 2);
    assert.equal(countRows(db, 'authors'), 2);
    assert.equal(countRows(db, 'work_authors'), 2);
    assert.equal(countRows(db, 'subjects'), 2);
    assert.equal(countRows(db, 'work_series'), 1);
    assert.equal(countRows(db, 'work_titles'), 4);
    const series = db.prepare('SELECT work_id, position FROM work_series').get();
    assert.deepEqual(series, { work_id: '/works/OL1W', position: '1' });
    const author = db.prepare('SELECT name FROM authors WHERE id = ?').get('/authors/OL1A');
    assert.deepEqual(author, { name: 'Autora Exemplo' });
  } finally {
    db.close();
  }

  await importCatalog(options);
  const repeated = openCatalog(dbPath);
  try {
    assert.equal(countRows(repeated, 'works'), 2);
    assert.equal(countRows(repeated, 'editions'), 2);
    assert.equal(countRows(repeated, 'work_series'), 1);
    assert.equal(countRows(repeated, 'work_titles'), 4);
    assert.deepEqual(repeated.prepare('SELECT position FROM work_series').get(), { position: '1' });
  } finally {
    repeated.close();
  }
});

test('streams gzip-compressed Open Library dumps', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'the-archives-gzip-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const compressedPath = (name: string): string => {
    const path = join(directory, `${name}.gz`);
    writeFileSync(path, gzipSync(readFileSync(join(fixtures, name))));
    return path;
  };
  const dbPath = join(directory, 'catalog.db');

  await importCatalog({
    dbPath,
    worksPath: compressedPath('works.tsv'),
    editionsPath: compressedPath('editions.tsv'),
    authorsPath: compressedPath('authors.tsv'),
    selectionPath: join(fixtures, 'selection.txt'),
  });

  const db = openCatalog(dbPath);
  try {
    assert.equal(countRows(db, 'works'), 2);
    assert.equal(countRows(db, 'editions'), 2);
  } finally {
    db.close();
  }
});

test('skips an edition whose selected parent work is absent from the dump', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'the-archives-missing-work-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const selectionPath = join(directory, 'selection.txt');
  writeFileSync(selectionPath, '/works/OL1W\n/works/OL2W\n/works/OL3W\n');
  const report = await importCatalog({
    dbPath: join(directory, 'catalog.db'),
    worksPath: join(fixtures, 'works.tsv'),
    editionsPath: join(fixtures, 'editions.tsv'),
    authorsPath: join(fixtures, 'authors.tsv'),
    selectionPath,
  });

  assert.equal(report.skipped, 1);
  const db = openCatalog(join(directory, 'catalog.db'));
  try {
    assert.equal(countRows(db, 'editions'), 2);
  } finally {
    db.close();
  }
});

test('moving an edition removes its title from the former work search index', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'the-archives-move-edition-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const dbPath = join(directory, 'catalog.db');
  const options = {
    dbPath,
    worksPath: join(fixtures, 'works.tsv'),
    editionsPath: join(fixtures, 'editions.tsv'),
    authorsPath: join(fixtures, 'authors.tsv'),
    selectionPath: join(fixtures, 'selection.txt'),
  };
  await importCatalog(options);
  const updatedEditions = join(directory, 'editions.tsv');
  const original = readFileSync(options.editionsPath, 'utf8');
  const moved = original.replace('"/works/OL1W"', '"/works/OL2W"');
  assert.notEqual(moved, original);
  writeFileSync(updatedEditions, moved);
  await importCatalog({ ...options, editionsPath: updatedEditions });

  const db = openCatalog(dbPath);
  try {
    const rows = db.prepare('SELECT work_id FROM work_titles WHERE title = ?')
      .all('The Fellowship of the Ring');
    assert.deepEqual(rows, [{ work_id: '/works/OL2W' }]);
    assert.deepEqual(db.prepare('SELECT work_id FROM editions WHERE id = ?').get('/books/OL1M'), {
      work_id: '/works/OL2W',
    });
  } finally {
    db.close();
  }
});

test('a missing gzip dump rejects with a file error instead of crashing the process', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'the-archives-missing-gzip-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  await assert.rejects(importCatalog({
    dbPath: join(directory, 'catalog.db'),
    worksPath: join(directory, 'missing.tsv.gz'),
    editionsPath: join(fixtures, 'editions.tsv'),
    authorsPath: join(fixtures, 'authors.tsv'),
    selectionPath: join(fixtures, 'selection.txt'),
  }), /ENOENT/);
});
