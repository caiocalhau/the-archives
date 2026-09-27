import assert from 'node:assert/strict';
import { test } from 'node:test';
import { initializeCatalog, openCatalog } from '../src/catalog/db.js';

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
        .run('/books/OL1M', '/works/missing', 'Livro'),
      /FOREIGN KEY/,
    );
    db.prepare('INSERT INTO works(id, title, source) VALUES (?, ?, ?)')
      .run('/works/OL1W', 'Livro', 'openlibrary');
    db.prepare('INSERT INTO editions(id, work_id, title) VALUES (?, ?, ?)')
      .run('/books/OL1M', '/works/OL1W', 'Livro');
    assert.throws(
      () => db.prepare('INSERT INTO editions(id, work_id, title) VALUES (?, ?, ?)')
        .run('/books/OL1M', '/works/OL1W', 'Livro'),
      /UNIQUE/,
    );
  } finally {
    db.close();
  }
});
