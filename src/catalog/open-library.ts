export interface DumpRecord {
  type: string;
  key: string;
  data: Record<string, unknown>;
}

export interface NormalizedSeries {
  id: string;
  name: string;
  position: string | null;
}

export interface NormalizedWork {
  id: string;
  title: string;
  description: string | null;
  firstPublishYear: number | null;
  authorIds: string[];
  subjects: string[];
  series: NormalizedSeries[];
}

export interface NormalizedEdition {
  id: string;
  workId: string;
  title: string;
  language: string | null;
  series: NormalizedSeries[];
}

export interface NormalizedAuthor {
  id: string;
  name: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function referenceKey(value: unknown, prefix: string): string | null {
  if (!isObject(value)) return null;
  const key = nonEmptyString(value.key);
  return key?.startsWith(prefix) ? key : null;
}

function normalizeSeries(value: unknown): NormalizedSeries[] {
  if (!Array.isArray(value)) return [];
  const result: NormalizedSeries[] = [];
  for (const entry of value) {
    const text = nonEmptyString(entry);
    if (!text) continue;
    const match = /^(.*?)\s*#\s*(\d+(?:\.\d+)?)$/.exec(text);
    const name = (match?.[1] ?? text).trim();
    if (!name) continue;
    result.push({
      id: `openlibrary:series:${name.replace(/\s+/g, ' ').toLowerCase()}`,
      name,
      position: match?.[2] ?? null,
    });
  }
  return result;
}

export function parseDumpLine(line: string): DumpRecord | null {
  const columns = line.split('\t');
  if (columns.length !== 5) return null;
  const [type, key, , , json] = columns;
  if (!type?.startsWith('/type/') || !key?.startsWith('/') || !json) return null;
  try {
    const data: unknown = JSON.parse(json);
    return isObject(data) ? { type, key, data } : null;
  } catch {
    return null;
  }
}

export function normalizeWork(record: DumpRecord | null): NormalizedWork | null {
  if (record?.type !== '/type/work' || !record.key.startsWith('/works/')) return null;
  const title = nonEmptyString(record.data.title);
  if (!title) return null;
  const rawDescription = record.data.description;
  const description = nonEmptyString(
    isObject(rawDescription) ? rawDescription.value : rawDescription,
  );
  const date = nonEmptyString(record.data.first_publish_date);
  const year = date?.match(/(?:^|\D)(1\d{3}|20\d{2})(?!\d)/)?.[1];
  const authors = Array.isArray(record.data.authors) ? record.data.authors : [];
  const subjects = Array.isArray(record.data.subjects) ? record.data.subjects : [];
  return {
    id: record.key,
    title,
    description,
    firstPublishYear: year ? Number(year) : null,
    authorIds: authors.flatMap((entry) => {
      const key = isObject(entry) ? referenceKey(entry.author, '/authors/') : null;
      return key ? [key] : [];
    }),
    subjects: subjects.flatMap((entry) => {
      const subject = nonEmptyString(entry);
      return subject ? [subject] : [];
    }),
    series: normalizeSeries(record.data.series),
  };
}

export function normalizeEdition(record: DumpRecord | null): NormalizedEdition | null {
  if (record?.type !== '/type/edition' || !record.key.startsWith('/books/')) return null;
  const title = nonEmptyString(record.data.title);
  const works = Array.isArray(record.data.works) ? record.data.works : [];
  const workId = referenceKey(works[0], '/works/');
  if (!title || !workId) return null;
  const languages = Array.isArray(record.data.languages) ? record.data.languages : [];
  const languageKey = referenceKey(languages[0], '/languages/');
  return {
    id: record.key,
    workId,
    title,
    language: languageKey?.slice('/languages/'.length) ?? null,
    series: normalizeSeries(record.data.series),
  };
}

export function normalizeAuthor(record: DumpRecord | null): NormalizedAuthor | null {
  if (record?.type !== '/type/author' || !record.key.startsWith('/authors/')) return null;
  const name = nonEmptyString(record.data.name);
  return name ? { id: record.key, name } : null;
}
