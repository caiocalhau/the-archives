import type { WorkDetails } from '../queries.js';

export type BookSource = 'local' | 'openlibrary' | 'google';
export type ProviderName = 'openlibrary' | 'google';
export type ProviderStatus = 'not_needed' | 'ok' | 'no_match' | 'skipped' | 'error';
export type ErrorKind = 'timeout' | 'rate_limit' | 'malformed_response' | 'network';

export interface ProviderOutcome {
  status: ProviderStatus;
  errorKind?: ErrorKind;
}

export interface BookRecord {
  source: BookSource;
  id: string;
  title: string;
  authors: string[];
  description: string | null;
  subjects: string[];
}

export type ProviderResult<T> =
  | { status: 'ok'; value: T }
  | { status: 'no_match' | 'skipped' | 'error'; value: null; errorKind?: ErrorKind };

export interface BookProvider {
  search(title: string, authors?: string[]): Promise<ProviderResult<BookRecord[]>>;
  get(id: string): Promise<ProviderResult<BookRecord>>;
}

export interface DiscoveryResult {
  candidates: BookRecord[];
  providers: Record<ProviderName, ProviderOutcome>;
}

export interface InspectResult {
  selected: BookRecord | null;
  localDetails?: { editions: WorkDetails['editions']; series: WorkDetails['series'] };
  sameSourceDetails: BookRecord | null;
  externalCandidates: BookRecord[];
  providers: Record<ProviderName, ProviderOutcome>;
}
