import type Database from 'better-sqlite3';

export interface WorkSummary {
  id: string;
  title: string;
}

export interface WorkDetails extends WorkSummary {
  description: string | null;
  authors: string[];
  editions: { id: string; title: string; language: string | null }[];
  subjects: string[];
  series: { id: string; name: string | null; position: string | null }[];
}

export function searchWorksByTitle(
  db: Database.Database,
  query: string,
  limit: number,
): WorkSummary[] {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError('Search limit must be a positive integer');
  }
  const tokens = query.normalize('NFC').match(/[\p{L}\p{N}]+/gu);
  if (!tokens?.length) return [];
  const expression = tokens.map((token) => `"${token}"`).join(' AND ');
  return db.prepare(`
    SELECT DISTINCT works.id, works.title
    FROM work_titles
    JOIN works ON works.id = work_titles.work_id
    WHERE work_titles MATCH ?
    ORDER BY works.title COLLATE NOCASE, works.id
    LIMIT ?
  `).all(expression, limit) as WorkSummary[];
}

export function getWorkDetails(db: Database.Database, workId: string): WorkDetails | null {
  const work = db.prepare('SELECT id, title, description FROM works WHERE id = ?')
    .get(workId) as (WorkSummary & { description: string | null }) | undefined;
  if (!work) return null;

  const authors = db.prepare(`
    SELECT authors.name
    FROM work_authors
    JOIN authors ON authors.id = work_authors.author_id
    WHERE work_authors.work_id = ? AND authors.name IS NOT NULL
    ORDER BY authors.name COLLATE NOCASE
  `).all(workId) as { name: string }[];
  const editions = db.prepare(`
    SELECT id, title, language FROM editions
    WHERE work_id = ? ORDER BY title COLLATE NOCASE, id
  `).all(workId) as WorkDetails['editions'];
  const subjects = db.prepare(`
    SELECT subjects.label
    FROM work_subjects
    JOIN subjects ON subjects.id = work_subjects.subject_id
    WHERE work_subjects.work_id = ?
    ORDER BY subjects.label COLLATE NOCASE
  `).all(workId) as { label: string }[];
  const series = db.prepare(`
    SELECT series.id, series.name, work_series.position
    FROM work_series
    JOIN series ON series.id = work_series.series_id
    WHERE work_series.work_id = ?
    ORDER BY series.name COLLATE NOCASE, series.id
  `).all(workId) as WorkDetails['series'];

  return {
    ...work,
    authors: authors.map(({ name }) => name),
    editions,
    subjects: subjects.map(({ label }) => label),
    series,
  };
}
