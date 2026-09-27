import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { initializeCatalog, openCatalog } from '../src/catalog/db.js';
import { getWorkDetails, searchWorksByTitle } from '../src/catalog/queries.js';

test('catalog initialization creates the book relations and title index', () => {
  const db = openCatalog(':memory:');
  try {
    initializeCatalog(db);
    const names = db.prepare("SELECT name FROM sqlite_master WHERE type IN ('table', 'view')").all() as { name: string }[];
    const actual = new Set(names.map(({ name }) => name));
    for (const expected of [
      'works', 'editions', 'authors', 'work_authors', 'series',
      'work_series', 'subjects', 'work_subjects', 'work_titles',
    ]) {
      assert.ok(actual.has(expected), `missing ${expected}`);
    }
  } finally {
    db.close();
  }
});

test('editions require an existing work and a unique source ID', () => {
  const db = openCatalog(':memory:');
  try {
    initializeCatalog(db);
    assert.equal(db.pragma('foreign_keys', { simple: true }), 1);
    assert.throws(
      () => db.prepare('INSERT INTO editions(id, work_id, title) VALUES (?, ?, ?)')
        .run('/books/OL1M', '/works/missing', 'Book'),
      /FOREIGN KEY/,
    );
    db.prepare('INSERT INTO works(id, title, source) VALUES (?, ?, ?)')
      .run('/works/OL1W', 'Book', 'openlibrary');
    db.prepare('INSERT INTO editions(id, work_id, title) VALUES (?, ?, ?)')
      .run('/books/OL1M', '/works/OL1W', 'Book');
    assert.throws(
      () => db.prepare('INSERT INTO editions(id, work_id, title) VALUES (?, ?, ?)')
        .run('/books/OL1M', '/works/OL1W', 'Book'),
      /UNIQUE/,
    );
  } finally {
    db.close();
  }
});

test('catalog initialization records its baseline migration only once', () => {
  const db = openCatalog(':memory:');
  try {
    initializeCatalog(db);
    initializeCatalog(db);
    const migrations = db.prepare('SELECT COUNT(*) AS count FROM __drizzle_migrations')
      .get() as { count: number };
    assert.equal(migrations.count, 1);
  } finally {
    db.close();
  }
});

test('catalog initialization preserves an existing catalog and its title search', () => {
  const db = openCatalog(':memory:');
  try {
    db.exec(readFileSync(new URL('./fixtures/legacy-schema.sql', import.meta.url), 'utf8'));
    db.prepare('INSERT INTO works(id, title, source) VALUES (?, ?, ?)')
      .run('/works/OL1W', 'Existing book', 'openlibrary');
    db.prepare('INSERT INTO authors(id, name) VALUES (?, ?)')
      .run('/authors/OL1A', 'Existing author');
    db.prepare('INSERT INTO work_authors(work_id, author_id) VALUES (?, ?)')
      .run('/works/OL1W', '/authors/OL1A');
    db.prepare('INSERT INTO work_titles(work_id, title) VALUES (?, ?)')
      .run('/works/OL1W', 'Existing book');

    initializeCatalog(db);

    assert.deepEqual(searchWorksByTitle(db, 'existing book', 10), [
      { id: '/works/OL1W', title: 'Existing book' },
    ]);
    assert.deepEqual(getWorkDetails(db, '/works/OL1W')?.authors, ['Existing author']);
    assert.equal(
      (db.prepare('SELECT COUNT(*) AS count FROM __drizzle_migrations').get() as { count: number }).count,
      1,
    );
  } finally {
    db.close();
  }
});
