import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';
import { importCatalog } from '../src/catalog/import.js';
import { openCatalog } from '../src/catalog/db.js';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const fixtures = fileURLToPath(new URL('./fixtures/', import.meta.url));
const fakeKey = 'never-print-this-key';

function run(...args: string[]) {
  const result = spawnSync(process.execPath, ['--import', 'tsx', 'src/cli.ts', ...args], {
    cwd: projectRoot, encoding: 'utf8',
    env: { ...process.env, GOOGLE_BOOKS_API_KEY: fakeKey },
  });
  assert.ifError(result.error);
  assert.equal(`${result.stdout}${result.stderr}`.includes(fakeKey), false);
  return result;
}

async function temporaryCatalog(t: TestContext): Promise<string> {
  const directory = mkdtempSync(join(tmpdir(), 'the-archives-discovery-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const dbPath = join(directory, 'catalog.db');
  await importCatalog({
    dbPath,
    worksPath: join(fixtures, 'works.tsv'),
    editionsPath: join(fixtures, 'editions.tsv'),
    authorsPath: join(fixtures, 'authors.tsv'),
    selectionPath: join(fixtures, 'selection.txt'),
  });
  return dbPath;
}

test('discover prints local candidates and inspect prints details without recommendations', async (t) => {
  const dbPath = await temporaryCatalog(t);
  const beforeDb = openCatalog(dbPath);
  const before = beforeDb.serialize();
  beforeDb.close();

  const found = run('discover', 'lord of the rings', '--db', dbPath);
  assert.equal(found.status, 0, found.stderr);
  const discovery = JSON.parse(found.stdout);
  assert.deepEqual(discovery.candidates.map(({ source, id }: { source: string; id: string }) =>
    ({ source, id })), [{ source: 'local', id: '/works/OL1W' }]);
  assert.equal(Object.hasOwn(discovery.candidates[0], 'url'), false);
  assert.deepEqual(discovery.providers, {
    openlibrary: { status: 'not_needed' }, google: { status: 'not_needed' },
  });

  const inspected = run('inspect', 'local', '/works/OL1W', '--db', dbPath);
  assert.equal(inspected.status, 0, inspected.stderr);
  const details = JSON.parse(inspected.stdout);
  assert.equal(details.selected.title, 'The Lord of the Rings');
  assert.equal(Object.hasOwn(details.selected, 'url'), false);
  assert.equal(details.localDetails.series[0].position, '1');
  assert.equal('recommendations' in details, false);
  assert.deepEqual(details.providers, {
    openlibrary: { status: 'not_needed' }, google: { status: 'not_needed' },
  });
  const recommend = run('recommend', '/works/OL1W', '--db', dbPath);
  assert.equal(recommend.status, 0, recommend.stderr);
  assert.deepEqual(JSON.parse(recommend.stdout), []);

  const afterDb = openCatalog(dbPath);
  assert.deepEqual(afterDb.serialize(), before);
  afterDb.close();
});

test('discovery commands reject a missing database without creating it', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'the-archives-discovery-missing-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const dbPath = join(directory, 'absent.db');
  for (const args of [
    ['discover', 'Book', '--db', dbPath],
    ['inspect', 'local', '/works/OL1W', '--db', dbPath],
  ]) {
    const result = run(...args);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Database not found/);
    assert.equal(result.stdout, '');
    assert.equal(existsSync(dbPath), false);
  }
});

test('inspect rejects invalid source, IDs, and arity before a provider call', async (t) => {
  const dbPath = await temporaryCatalog(t);
  const cases = [
    ['inspect', 'unknown', '/works/OL1W', '--db', dbPath],
    ['inspect', 'openlibrary', '/books/OL1M', '--db', dbPath],
    ['inspect', 'openlibrary', 'https://evil.test', '--db', dbPath],
    ['inspect', 'google', '../bad', '--db', dbPath],
    ['inspect', 'local', '--db', dbPath],
    ['inspect', 'local', '/works/OL1W', 'extra', '--db', dbPath],
    ['discover', 'one', 'two', '--db', dbPath],
  ];
  for (const args of cases) {
    const result = run(...args);
    assert.equal(result.status, 1, `accepted ${args.join(' ')}`);
    assert.equal(result.stdout, '');
  }
});
