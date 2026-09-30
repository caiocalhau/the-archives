import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createOpenLibraryProvider } from '../src/catalog/discovery/open-library.js';

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status, headers: { 'content-type': 'application/json' },
  });
}

test('search accepts matching work or edition titles and keeps distinct work IDs', async () => {
  const urls: URL[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    urls.push(new URL(String(input)));
    return json({ docs: [
      { key: '/works/OL1W', title: 'The Hobbit', author_name: ['Tolkien'] },
      { key: '/works/OL1W', title: 'The Hobbit', author_name: ['Tolkien'] },
      { key: '/works/OL2W', title: 'O Hobbit', editions: { docs: [{ title: 'The Hobbit' }] } },
      { key: '/works/OL3W', title: 'Hobbitry' },
      { key: '/books/OL4M', title: 'The Hobbit' },
    ] });
  };
  const result = await createOpenLibraryProvider({ fetchImpl, contactEmail: 'test@example.org' })
    .search('The Hobbit');
  assert.equal(result.status, 'ok');
  if (result.status !== 'ok') return;
  assert.deepEqual(result.value.map(({ id }) => id), ['/works/OL1W', '/works/OL2W']);
  assert.equal(result.value[0]?.url, 'https://openlibrary.org/works/OL1W');
  assert.deepEqual(result.value[0]?.authors, ['Tolkien']);
  assert.equal(result.value[0]?.description, null);
  assert.deepEqual(result.value[0]?.subjects, []);
  assert.equal(urls[0]?.host, 'openlibrary.org');
  assert.equal(urls[0]?.pathname, '/search.json');
  assert.equal(urls[0]?.searchParams.get('limit'), '5');
  assert.match(urls[0]?.searchParams.get('fields') ?? '', /editions/);
});

test('work lookup maps text and resolves bounded author references', async () => {
  const calls: string[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    calls.push(url.pathname);
    assert.equal(url.host, 'openlibrary.org');
    assert.equal(init?.redirect, 'error');
    assert.match(new Headers(init?.headers).get('User-Agent') ?? '', /test@example.org/);
    if (url.pathname === '/works/OL9W.json') return json({
      key: '/works/OL9W', title: 'Book', description: { value: 'A story.' },
      subjects: ['Fantasy', 5, 'Magic'],
      authors: [
        { author: { key: '/authors/OL1A' } },
        { author: { key: '/authors/OL2A' } },
        { author: { key: '/authors/invalid' } },
      ],
    });
    if (url.pathname === '/authors/OL1A.json') return json({ name: 'First Author' });
    if (url.pathname === '/authors/OL2A.json') return json({}, 404);
    throw new Error(`Unexpected ${url.pathname}`);
  };
  const result = await createOpenLibraryProvider({ fetchImpl, contactEmail: 'test@example.org' })
    .get('/works/OL9W');
  assert.equal(result.status, 'ok');
  if (result.status !== 'ok') return;
  assert.deepEqual(result.value, {
    source: 'openlibrary', id: '/works/OL9W', title: 'Book',
    authors: ['First Author'], description: 'A story.',
    subjects: ['Fantasy', 'Magic'], url: 'https://openlibrary.org/works/OL9W',
  });
  assert.deepEqual(calls, ['/works/OL9W.json', '/authors/OL1A.json', '/authors/OL2A.json']);
});

test('invalid work IDs never produce a request', async () => {
  const fetchImpl: typeof fetch = async () => { throw new Error('fetch must not run'); };
  const provider = createOpenLibraryProvider({ fetchImpl });
  for (const id of ['/works/../../other', '/books/OL1M', '', 'https://evil.test/works/OL1W']) {
    assert.equal((await provider.get(id)).status, 'no_match');
  }
});

test('HTTP failures produce safe outcomes without throwing', async () => {
  const response = (value: Response | Error): typeof fetch => async () => {
    if (value instanceof Error) throw value;
    return value;
  };
  const cases = [
    { value: json({}, 404), status: 'no_match', errorKind: undefined },
    { value: json({}, 429), status: 'error', errorKind: 'rate_limit' },
    { value: new Response('<html>', { headers: { 'content-type': 'text/html' } }), status: 'error', errorKind: 'malformed_response' },
    { value: new Response('{', { headers: { 'content-type': 'application/json' } }), status: 'error', errorKind: 'malformed_response' },
    { value: new DOMException('aborted', 'AbortError'), status: 'error', errorKind: 'timeout' },
    { value: new Error('private transport detail'), status: 'error', errorKind: 'network' },
  ];
  for (const { value, status, errorKind } of cases) {
    const result = await createOpenLibraryProvider({ fetchImpl: response(value) })
      .get('/works/OL9W');
    assert.equal(result.status, status);
    if (result.status === 'ok') assert.fail('A failed HTTP request returned a book');
    assert.equal(result.errorKind, errorKind);
    assert.equal(result.value, null);
  }
});

test('anonymous requests are spaced at least one second apart within a provider', async () => {
  let now = 100;
  const waits: number[] = [];
  const fetchImpl: typeof fetch = async () => json({ docs: [] });
  const provider = createOpenLibraryProvider({
    fetchImpl, now: () => now,
    sleep: async (ms) => { waits.push(ms); now += ms; },
  });
  await provider.search('One');
  await provider.search('Two');
  assert.deepEqual(waits, [1000]);
});
