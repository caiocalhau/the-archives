import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createGoogleBooksProvider } from '../src/catalog/discovery/google-books.js';

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status, headers: { 'content-type': 'application/json' },
  });
}

test('search returns credible volume candidates with source metadata', async () => {
  const key = 'private-test-key';
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.host, 'www.googleapis.com');
    assert.equal(url.pathname, '/books/v1/volumes');
    assert.equal(url.searchParams.get('maxResults'), '5');
    assert.match(url.searchParams.get('q') ?? '', /Fourth Wing/);
    assert.equal(url.href.includes(key), false);
    assert.equal(new Headers(init?.headers).get('X-Goog-Api-Key'), key);
    assert.equal(init?.redirect, 'error');
    return json({ items: [
      { id: 'vol_1', volumeInfo: {
        title: 'Fourth Wing', authors: ['Rebecca Yarros'],
        description: 'A dragon school.', categories: ['Fantasy'],
        infoLink: 'https://books.google.com/books?id=vol_1',
      } },
      { id: 'vol_2', volumeInfo: { title: 'A Different Book' } },
    ] });
  };
  const result = await createGoogleBooksProvider({ apiKey: key, fetchImpl })
    .search('Fourth Wing');
  assert.equal(result.status, 'ok');
  if (result.status !== 'ok') return;
  assert.deepEqual(result.value, [{
    source: 'google', id: 'vol_1', title: 'Fourth Wing',
    authors: ['Rebecca Yarros'], description: 'A dragon school.',
    subjects: ['Fantasy'],
  }]);
  assert.equal(JSON.stringify(result).includes(key), false);
});

test('get ignores a malformed optional infoLink and keeps absent fields absent', async () => {
  const fetchImpl: typeof fetch = async (input) => {
    assert.equal(new URL(String(input)).pathname, '/books/v1/volumes/vol_2');
    return json({ id: 'vol_2', volumeInfo: {
      title: 'A Book', infoLink: 'not an absolute URL',
    } });
  };
  const result = await createGoogleBooksProvider({ apiKey: 'key', fetchImpl }).get('vol_2');
  assert.equal(result.status, 'ok');
  if (result.status !== 'ok') return;
  assert.deepEqual(result.value, {
    source: 'google', id: 'vol_2', title: 'A Book', authors: [],
    description: null, subjects: [],
  });
});

test('missing key skips requests and invalid IDs do not reach the network', async () => {
  const fetchImpl: typeof fetch = async () => { throw new Error('must not fetch'); };
  const noKey = createGoogleBooksProvider({ fetchImpl });
  assert.equal((await noKey.search('Book')).status, 'skipped');
  assert.equal((await noKey.get('vol_1')).status, 'skipped');
  const withKey = createGoogleBooksProvider({ apiKey: 'key', fetchImpl });
  for (const id of ['', '../volume', 'https://evil.test', 'a/b']) {
    assert.equal((await withKey.get(id)).status, 'no_match');
  }
});

test('empty and failed responses return safe outcomes', async () => {
  const response = (value: Response | Error): typeof fetch => async () => {
    if (value instanceof Error) throw value;
    return value;
  };
  const cases = [
    { value: json({ totalItems: 0 }), status: 'no_match', errorKind: undefined },
    { value: json({}, 404), status: 'no_match', errorKind: undefined },
    { value: json({}, 429), status: 'error', errorKind: 'rate_limit' },
    { value: json({ items: 'wrong' }), status: 'error', errorKind: 'malformed_response' },
    { value: new Response('{', { headers: { 'content-type': 'application/json' } }), status: 'error', errorKind: 'malformed_response' },
    { value: new DOMException('aborted', 'AbortError'), status: 'error', errorKind: 'timeout' },
    { value: new Error('secret transport detail'), status: 'error', errorKind: 'network' },
  ];
  for (const { value, status, errorKind } of cases) {
    const result = await createGoogleBooksProvider({ apiKey: 'private', fetchImpl: response(value) })
      .search('Book');
    assert.equal(result.status, status);
    if (result.status === 'ok') assert.fail('A failed search returned a book');
    assert.equal(result.errorKind, errorKind);
    assert.equal(JSON.stringify(result).includes('private'), false);
  }
});
