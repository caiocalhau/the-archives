import type Database from 'better-sqlite3';
import { getWorkDetails, searchWorksByTitle, type WorkDetails } from '../queries.js';
import type {
  BookProvider, BookRecord, BookSource, DiscoveryResult, InspectResult,
  ProviderOutcome, ProviderResult,
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

function localBook(details: WorkDetails): BookRecord {
  return {
    source: 'local', id: details.id, title: details.title,
    authors: details.authors, description: details.description,
    subjects: details.subjects,
    url: /^\/works\/OL\d+W$/.test(details.id)
      ? `https://openlibrary.org${details.id}` : null,
  };
}

function hasDescription(book: BookRecord): boolean {
  return Boolean(book.description?.trim());
}

function hasSubjects(book: BookRecord): boolean {
  return book.subjects.some((subject) => subject.trim() !== '');
}

function complete(book: BookRecord): boolean {
  return hasDescription(book) && hasSubjects(book);
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
    local.push(localBook(details));
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

export async function inspectBook(
  db: Database.Database,
  source: BookSource,
  id: string,
  providers: Providers,
): Promise<InspectResult | null> {
  const providersStatus = outcomes();
  const result: InspectResult = {
    selected: null, sameSourceDetails: null, externalCandidates: [],
    providers: providersStatus,
  };

  if (source === 'local') {
    const details = getWorkDetails(db, id);
    if (!details) return null;
    result.selected = localBook(details);
    result.localDetails = { editions: details.editions, series: details.series };
    if (complete(result.selected)) return result;

    if (/^\/works\/OL\d+W$/.test(id)) {
      const openResult = await providers.openlibrary.get(id);
      providersStatus.openlibrary = outcome(openResult);
      if (openResult.status === 'ok') result.sameSourceDetails = openResult.value;
    } else {
      const openResult = await providers.openlibrary.search(details.title, details.authors);
      providersStatus.openlibrary = outcome(openResult);
      result.externalCandidates.push(...candidates(openResult));
    }

    if (result.sameSourceDetails && complete({
      ...result.selected,
      description: hasDescription(result.selected)
        ? result.selected.description : result.sameSourceDetails.description,
      subjects: hasSubjects(result.selected)
        ? result.selected.subjects : result.sameSourceDetails.subjects,
    })) return result;

    const googleResult = await providers.google.search(details.title, details.authors);
    providersStatus.google = outcome(googleResult);
    result.externalCandidates.push(...candidates(googleResult));
    return result;
  }

  const selectedResult = await providers[source].get(id);
  providersStatus[source] = outcome(selectedResult);
  if (selectedResult.status !== 'ok') return result;
  result.selected = selectedResult.value;
  if (source === 'openlibrary' && !complete(result.selected)) {
    const googleResult = await providers.google.search(
      result.selected.title, result.selected.authors,
    );
    providersStatus.google = outcome(googleResult);
    result.externalCandidates = candidates(googleResult);
  }
  return result;
}
