import type Database from 'better-sqlite3';
import { getWorkDetails, searchWorksByTitle } from '../queries.js';
import type {
  BookProvider, BookRecord, DiscoveryResult, ProviderOutcome, ProviderResult,
} from './types.js';

interface Providers {
  openlibrary: BookProvider;
  google: BookProvider;
}

function outcomes(): DiscoveryResult['providers'] {
  return { openlibrary: { status: 'not_needed' }, google: { status: 'not_needed' } };
}

function outcome<T>(result: ProviderResult<T>): ProviderOutcome {
  return result.status === 'error'
    ? { status: 'error', errorKind: result.errorKind }
    : { status: result.status };
}

function candidates(result: ProviderResult<BookRecord[]>): BookRecord[] {
  if (result.status !== 'ok') return [];
  const seen = new Set<string>();
  return result.value.filter((book) => {
    const key = `${book.source}:${book.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 5);
}

export async function discoverBooks(
  db: Database.Database,
  title: string,
  providers: Providers,
): Promise<DiscoveryResult> {
  const providersStatus = outcomes();
  const local: BookRecord[] = [];
  for (const { id } of searchWorksByTitle(db, title, 20)) {
    const details = getWorkDetails(db, id);
    if (!details) continue;
    local.push({
      source: 'local', id: details.id, title: details.title,
      authors: details.authors, description: details.description,
      subjects: details.subjects,
      url: /^\/works\/OL\d+W$/.test(details.id)
        ? `https://openlibrary.org${details.id}` : null,
    });
  }
  if (local.length) return { candidates: local, providers: providersStatus };

  const openResult = await providers.openlibrary.search(title);
  providersStatus.openlibrary = outcome(openResult);
  const openCandidates = candidates(openResult);
  if (openCandidates.length) return { candidates: openCandidates, providers: providersStatus };

  const googleResult = await providers.google.search(title);
  providersStatus.google = outcome(googleResult);
  return { candidates: candidates(googleResult), providers: providersStatus };
}
