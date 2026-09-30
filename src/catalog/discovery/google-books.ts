import { requestJson } from './http.js';
import { matchesTitle } from './title-match.js';
import type { BookProvider, BookRecord } from './types.js';

const volumeIdPattern = /^[A-Za-z0-9_-]+$/;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim() !== '')
    : [];
}

function book(value: unknown): BookRecord | null {
  const volume = record(value);
  const info = record(volume?.volumeInfo);
  if (!volume || !info || typeof volume.id !== 'string'
    || !volumeIdPattern.test(volume.id) || typeof info.title !== 'string'
    || !info.title.trim()) return null;

  return {
    source: 'google', id: volume.id, title: info.title,
    authors: strings(info.authors),
    description: typeof info.description === 'string' ? info.description.trim() || null : null,
    subjects: strings(info.categories),
  };
}

export function createGoogleBooksProvider(options: {
  apiKey?: string;
  fetchImpl?: typeof fetch;
}): BookProvider {
  const apiKey = options.apiKey?.trim();
  const fetchImpl = options.fetchImpl ?? fetch;
  const headers: Record<string, string> = apiKey ? { 'X-Goog-Api-Key': apiKey } : {};

  return {
    async search(title, authors = []) {
      if (!apiKey) return { status: 'skipped', value: null };
      const url = new URL('https://www.googleapis.com/books/v1/volumes');
      url.searchParams.set('q', [title, ...authors].join(' '));
      url.searchParams.set('maxResults', '5');
      const response = await requestJson(url, { headers }, fetchImpl);
      if (response.status !== 'ok') return response;
      const data = record(response.value);
      if (!data || (data.items !== undefined && !Array.isArray(data.items))) {
        return { status: 'error', value: null, errorKind: 'malformed_response' };
      }
      if (!Array.isArray(data.items)) {
        return data.totalItems === 0
          ? { status: 'no_match', value: null }
          : { status: 'error', value: null, errorKind: 'malformed_response' };
      }
      const candidates: BookRecord[] = [];
      const seen = new Set<string>();
      for (const item of data.items) {
        const candidate = book(item);
        if (!candidate || seen.has(candidate.id) || !matchesTitle(title, [candidate.title])) continue;
        candidates.push(candidate);
        seen.add(candidate.id);
        if (candidates.length === 5) break;
      }
      return candidates.length
        ? { status: 'ok', value: candidates }
        : { status: 'no_match', value: null };
    },
    async get(id) {
      if (!apiKey) return { status: 'skipped', value: null };
      if (!volumeIdPattern.test(id)) return { status: 'no_match', value: null };
      const url = new URL(`https://www.googleapis.com/books/v1/volumes/${encodeURIComponent(id)}`);
      const response = await requestJson(url, { headers }, fetchImpl);
      if (response.status !== 'ok') return response;
      const candidate = book(response.value);
      if (!candidate || candidate.id !== id) {
        return { status: 'error', value: null, errorKind: 'malformed_response' };
      }
      return { status: 'ok', value: candidate };
    },
  };
}
