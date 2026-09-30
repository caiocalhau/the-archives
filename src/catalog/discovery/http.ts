import type { ProviderResult } from './types.js';

export async function requestJson(
  url: URL,
  init: RequestInit,
  fetchImpl: typeof fetch,
): Promise<ProviderResult<unknown>> {
  try {
    const response = await fetchImpl(url, {
      ...init,
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
    });
    if (response.status === 404) return { status: 'no_match', value: null };
    if (response.status === 429) {
      return { status: 'error', value: null, errorKind: 'rate_limit' };
    }
    if (!response.ok) return { status: 'error', value: null, errorKind: 'network' };
    if (!response.headers.get('content-type')?.toLowerCase().includes('application/json')) {
      return { status: 'error', value: null, errorKind: 'malformed_response' };
    }
    try {
      return { status: 'ok', value: await response.json() as unknown };
    } catch {
      return { status: 'error', value: null, errorKind: 'malformed_response' };
    }
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    const errorKind = name === 'AbortError' || name === 'TimeoutError' ? 'timeout' : 'network';
    return { status: 'error', value: null, errorKind };
  }
}
