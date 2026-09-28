import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { initializeCatalog, openCatalog } from '../src/catalog/db.js';
import { works, workSubjects } from '../src/catalog/schema.js';
import { seedRecommendationCatalog } from './fixtures/recommendation-catalog.js';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));

function run(...args: string[]) {
  const result = spawnSync(process.execPath, ['--import', 'tsx', 'src/cli.ts', ...args], {
    cwd: projectRoot, encoding: 'utf8',
  });
  assert.ifError(result.error);
  return result;
}

function temporaryCatalog(t: TestContext, seed = true): string {
  const directory = mkdtempSync(join(tmpdir(), 'the-archives-recommend-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const dbPath = join(directory, 'catalog.db');
  if (seed) {
    const db = openCatalog(dbPath);
    try {
      initializeCatalog(db);
      seedRecommendationCatalog(db);
    } finally {
      db.close();
    }
  }
  return dbPath;
}

test('recommend CLI returns ranked works with catalog evidence as JSON', (t) => {
  const result = run('recommend', '/works/source', '--db', temporaryCatalog(t));
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.deepEqual(JSON.parse(result.stdout), [
    {
      id: '/works/two-themes', title: 'Two Themes', score: 6,
      sharedThemes: [
        { id: 'dragons', label: 'Dragons', weight: 3 },
        { id: 'magic', label: 'Magic', weight: 3 },
      ], sharedAuthorIds: [],
    },
    {
      id: '/works/same-author', title: 'Shared Author', score: 5,
      sharedThemes: [
        { id: 'fantasy', label: 'Fantasy', weight: 1 },
        { id: 'magic', label: 'Magic', weight: 3 },
      ], sharedAuthorIds: ['/authors/A'],
    },
    {
      id: '/works/same-name', title: 'Different Author ID', score: 4,
      sharedThemes: [
        { id: 'fantasy', label: 'Fantasy', weight: 1 },
        { id: 'magic', label: 'Magic', weight: 3 },
      ], sharedAuthorIds: [],
    },
  ]);
});

test('recommend CLI applies an explicit limit after ranking', (t) => {
  const result = run('recommend', '/works/source', '--db', temporaryCatalog(t), '--limit', '1');
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).map((work: { id: string }) => work.id), ['/works/two-themes']);
});

test('recommend CLI defaults to ten results when more candidates are eligible', (t) => {
  const dbPath = temporaryCatalog(t);
  const db = openCatalog(dbPath);
  try {
    const orm = drizzle(db);
    for (let index = 0; index < 12; index++) {
      const id = `/works/extra-${index}`;
      orm.insert(works).values({ id, title: `Extra Book ${index}`, source: 'synthetic' }).run();
      orm.insert(workSubjects).values({ workId: id, subjectId: 'fixture:magic' }).run();
    }
  } finally {
    db.close();
  }
  const result = run('recommend', '/works/source', '--db', dbPath);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).length, 10);
});

test('recommend CLI treats insufficient evidence as a successful empty result', (t) => {
  const result = run('recommend', '/works/sparse', '--db', temporaryCatalog(t));
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), []);
  assert.equal(result.stderr, '');
});

test('recommend CLI reports unknown works without printing successful output', (t) => {
  const result = run('recommend', '/works/missing', '--db', temporaryCatalog(t));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Work not found/);
  assert.equal(result.stdout, '');
});

test('recommend CLI rejects invalid limits', (t) => {
  const dbPath = temporaryCatalog(t);
  for (const limit of ['0', '-1', '1.5', 'NaN', 'Infinity', 'not-a-number']) {
    const result = run('recommend', '/works/source', '--db', dbPath, '--limit', limit);
    assert.equal(result.status, 1, `accepted limit ${limit}`);
    assert.match(result.stderr, /limit/i);
    assert.equal(result.stdout, '');
  }
});

test('recommend CLI requires exactly one work ID and a database option', (t) => {
  const dbPath = temporaryCatalog(t);
  for (const args of [
    ['recommend', '--db', dbPath],
    ['recommend', '/works/source', '/works/extra', '--db', dbPath],
  ]) {
    const result = run(...args);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Expected one argument/);
  }
  const missingDatabase = run('recommend', '/works/source');
  assert.equal(missingDatabase.status, 1);
  assert.match(missingDatabase.stderr, /Missing --db/);
  const missingValue = run('recommend', '/works/source', '--db', dbPath, '--limit');
  assert.equal(missingValue.status, 1);
  assert.match(missingValue.stderr, /Missing value/);
});

test('recommend CLI does not create a missing database', (t) => {
  const dbPath = temporaryCatalog(t, false);
  const result = run('recommend', '/works/source', '--db', dbPath);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Database not found/);
  assert.equal(existsSync(dbPath), false);
});

test('recommend CLI does not initialize an existing empty database', (t) => {
  const dbPath = temporaryCatalog(t, false);
  openCatalog(dbPath).close();
  const result = run('recommend', '/works/source', '--db', dbPath);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /works/);
  const db = openCatalog(dbPath);
  try {
    assert.deepEqual(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all(), []);
  } finally {
    db.close();
  }
});

test('recommend CLI preserves the database contents', (t) => {
  const dbPath = temporaryCatalog(t);
  const db = openCatalog(dbPath);
  const before = db.serialize();
  db.close();
  const result = run('recommend', '/works/source', '--db', dbPath);
  assert.equal(result.status, 0, result.stderr);
  const after = openCatalog(dbPath);
  try {
    assert.deepEqual(after.serialize(), before);
  } finally {
    after.close();
  }
});
