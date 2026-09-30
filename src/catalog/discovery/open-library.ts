import { requestJson } from './http.js';
import { matchesTitle } from './title-match.js';
import type { BookProvider, BookRecord, ProviderResult } from './types.js';

const workIdPattern = /^\/works\/OL\d+W$/;
const authorIdPattern = /^\/authors\/OL\d+A$/;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim() !== '')
    : [];
}

function description(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null;
  const text = record(value)?.value;
  return typeof text === 'string' ? text.trim() || null : null;
}

function book(value: Record<string, unknown>, authors: string[]): BookRecord | null {
  if (typeof value.key !== 'string' || !workIdPattern.test(value.key)) return null;
  if (typeof value.title !== 'string' || !value.title.trim()) return null;
  return {
    source: 'openlibrary', id: value.key, title: value.title,
    authors, description: description(value.description),
    subjects: strings(value.subjects),
  };
}

function editionTitles(value: unknown): string[] {
  const editions = record(value);
  if (!Array.isArray(editions?.docs)) return [];
  return editions.docs.map((item) => record(item)?.title)
    .filter((title): title is string => typeof title === 'string');
}

export function createOpenLibraryProvider(options: {
  fetchImpl?: typeof fetch;
  contactEmail?: string;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}): BookProvider {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const contactEmail = options.contactEmail?.trim();
  const headers: Record<string, string> = contactEmail
    ? { 'User-Agent': `TheArchives (${contactEmail})` } : {};
  let lastRequestTime: number | null = null;

  async function getJson(url: URL): Promise<ProviderResult<unknown>> {
    if (!contactEmail && lastRequestTime !== null) {
      const delay = Math.max(0, 1000 - (now() - lastRequestTime));
      if (delay > 0) await sleep(delay);
    }
    lastRequestTime = now();
    return requestJson(url, { headers }, fetchImpl);
  }

  return {
    async search(title, authors = []) {
      const url = new URL('https://openlibrary.org/search.json');
      url.searchParams.set('q', [title, ...authors].join(' '));
      url.searchParams.set('limit', '5');
      url.searchParams.set('fields', 'key,title,author_name,editions');
      const response = await getJson(url);
      if (response.status !== 'ok') return response;
      const data = record(response.value);
      if (!data || !Array.isArray(data.docs)) {
        return { status: 'error', value: null, errorKind: 'malformed_response' };
      }
      const found: BookRecord[] = [];
      const seen = new Set<string>();
      for (const entry of data.docs) {
        const row = record(entry);
        if (!row) continue;
        const candidate = book(row, strings(row.author_name));
        if (!candidate || seen.has(candidate.id)) continue;
        if (!matchesTitle(title, [candidate.title, ...editionTitles(row.editions)])) continue;
        found.push(candidate);
        seen.add(candidate.id);
        if (found.length === 5) break;
      }
      return found.length ? { status: 'ok', value: found } : { status: 'no_match', value: null };
    },
    async get(id) {
      if (!workIdPattern.test(id)) return { status: 'no_match', value: null };
      const response = await getJson(new URL(`https://openlibrary.org${id}.json`));
      if (response.status !== 'ok') return response;
      const data = record(response.value);
      if (!data) return { status: 'error', value: null, errorKind: 'malformed_response' };
      const candidate = book(data, []);
      if (!candidate || candidate.id !== id) {
        return { status: 'error', value: null, errorKind: 'malformed_response' };
      }
      const names: string[] = [];
      const refs = Array.isArray(data.authors) ? data.authors : [];
      for (const item of refs.slice(0, 5)) {
        const key = record(record(item)?.author)?.key;
        if (typeof key !== 'string' || !authorIdPattern.test(key)) continue;
        const author = await getJson(new URL(`https://openlibrary.org${key}.json`));
        if (author.status !== 'ok') continue;
        const name = record(author.value)?.name;
        if (typeof name === 'string' && name.trim()) names.push(name);
      }
      candidate.authors = names;
      return { status: 'ok', value: candidate };
    },
  };
}
