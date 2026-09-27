import type Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq, sql } from 'drizzle-orm';
import {
  authors, editions, series, subjects, workAuthors, works, workSeries, workSubjects,
} from './schema.js';

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
  const orm = drizzle(db);
  const work = orm.select({ id: works.id, title: works.title, description: works.description })
    .from(works).where(eq(works.id, workId)).get();
  if (!work) return null;

  const workAuthorsRows = orm.select({ name: authors.name }).from(workAuthors)
    .innerJoin(authors, eq(authors.id, workAuthors.authorId))
    .where(eq(workAuthors.workId, workId))
    .orderBy(sql`${authors.name} COLLATE NOCASE`).all();
  const workEditions = orm.select({
    id: editions.id,
    title: editions.title,
    language: editions.language,
  }).from(editions).where(eq(editions.workId, workId))
    .orderBy(sql`${editions.title} COLLATE NOCASE`, editions.id).all();
  const workSubjectsRows = orm.select({ label: subjects.label }).from(workSubjects)
    .innerJoin(subjects, eq(subjects.id, workSubjects.subjectId))
    .where(eq(workSubjects.workId, workId))
    .orderBy(sql`${subjects.label} COLLATE NOCASE`).all();
  const workSeriesRows = orm.select({
    id: series.id,
    name: series.name,
    position: workSeries.position,
  }).from(workSeries)
    .innerJoin(series, eq(series.id, workSeries.seriesId))
    .where(eq(workSeries.workId, workId))
    .orderBy(sql`${series.name} COLLATE NOCASE`, series.id).all();

  return {
    ...work,
    authors: workAuthorsRows.map(({ name }) => name)
      .filter((name): name is string => name !== null),
    editions: workEditions,
    subjects: workSubjectsRows.map(({ label }) => label),
    series: workSeriesRows,
  };
}
