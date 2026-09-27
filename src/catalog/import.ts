import { createReadStream, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { PassThrough } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';
import type Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq, sql } from 'drizzle-orm';
import { initializeCatalog, openCatalog } from './db.js';
import {
  authors, editions, series, subjects, workAuthors, works, workSeries, workSubjects,
} from './schema.js';
import {
  normalizeAuthor,
  normalizeEdition,
  normalizeWork,
  parseDumpLine,
  type NormalizedEdition,
  type NormalizedSeries,
  type NormalizedWork,
} from './open-library.js';

export interface ImportOptions {
  dbPath: string;
  worksPath: string;
  editionsPath: string;
  authorsPath: string;
  selectionPath: string;
}

export interface ImportReport {
  works: number;
  editions: number;
  authors: number;
  malformed: number;
  skipped: number;
}

async function* readLines(path: string): AsyncGenerator<string> {
  const file = createReadStream(path);
  const output = new PassThrough();
  const completion = path.endsWith('.gz')
    ? pipeline(file, createGunzip(), output)
    : pipeline(file, output);
  void completion.catch(() => undefined);
  const reader = createInterface({ input: output, crlfDelay: Infinity });
  try {
    for await (const line of reader) yield line;
    await completion;
  } finally {
    reader.close();
    output.destroy();
    file.destroy();
  }
}

function catalogWriter(db: Database.Database) {
  const orm = drizzle(db);

  const refreshTitles = (workId: string): void => {
    orm.run(sql`DELETE FROM work_titles WHERE work_id = ${workId}`);
    const work = orm.select({ title: works.title }).from(works)
      .where(eq(works.id, workId)).get();
    if (work) orm.run(sql`INSERT INTO work_titles(work_id, title) VALUES (${workId}, ${work.title})`);
    const titles = orm.select({ title: editions.title }).from(editions)
      .where(eq(editions.workId, workId)).all();
    for (const edition of titles) {
      orm.run(sql`INSERT INTO work_titles(work_id, title) VALUES (${workId}, ${edition.title})`);
    }
  };

  const addSeries = (workId: string, entries: NormalizedSeries[]): void => {
    for (const entry of entries) {
      orm.insert(series).values({ id: entry.id, name: entry.name })
        .onConflictDoUpdate({ target: series.id, set: { name: entry.name } }).run();
      orm.insert(workSeries).values({ workId, seriesId: entry.id, position: entry.position })
        .onConflictDoUpdate({
          target: [workSeries.workId, workSeries.seriesId],
          set: { position: sql`COALESCE(${workSeries.position}, excluded.position)` },
        }).run();
    }
  };

  return {
    work: db.transaction((work: NormalizedWork) => {
      orm.insert(works).values({
        id: work.id,
        title: work.title,
        description: work.description,
        firstPublishYear: work.firstPublishYear,
        source: 'openlibrary',
      }).onConflictDoUpdate({
        target: works.id,
        set: {
          title: work.title,
          description: work.description,
          firstPublishYear: work.firstPublishYear,
        },
      }).run();
      orm.delete(workAuthors).where(eq(workAuthors.workId, work.id)).run();
      for (const authorId of work.authorIds) {
        orm.insert(authors).values({ id: authorId }).onConflictDoNothing().run();
        orm.insert(workAuthors).values({ workId: work.id, authorId })
          .onConflictDoNothing().run();
      }
      orm.delete(workSubjects).where(eq(workSubjects.workId, work.id)).run();
      for (const label of work.subjects) {
        const id = `openlibrary:subject:${label.replace(/\s+/g, ' ').toLowerCase()}`;
        orm.insert(subjects).values({ id, label })
          .onConflictDoUpdate({ target: subjects.id, set: { label } }).run();
        orm.insert(workSubjects).values({ workId: work.id, subjectId: id })
          .onConflictDoNothing().run();
      }
      orm.delete(workSeries).where(eq(workSeries.workId, work.id)).run();
      addSeries(work.id, work.series);
      refreshTitles(work.id);
    }),
    edition: db.transaction((edition: NormalizedEdition) => {
      const previous = orm.select({ workId: editions.workId }).from(editions)
        .where(eq(editions.id, edition.id)).get();
      orm.insert(editions).values({
        id: edition.id,
        workId: edition.workId,
        title: edition.title,
        language: edition.language,
      }).onConflictDoUpdate({
        target: editions.id,
        set: { workId: edition.workId, title: edition.title, language: edition.language },
      }).run();
      addSeries(edition.workId, edition.series);
      refreshTitles(edition.workId);
      if (previous && previous.workId !== edition.workId) refreshTitles(previous.workId);
    }),
    author: db.transaction((id: string, name: string) => {
      orm.insert(authors).values({ id, name })
        .onConflictDoUpdate({ target: authors.id, set: { name } }).run();
    }),
  };
}

export async function importCatalog(options: ImportOptions): Promise<ImportReport> {
  const selected = new Set(
    readFileSync(options.selectionPath, 'utf8').split(/\r?\n/)
      .map((key) => key.trim()).filter((key) => key.startsWith('/works/')),
  );
  const report: ImportReport = { works: 0, editions: 0, authors: 0, malformed: 0, skipped: 0 };
  const db = openCatalog(options.dbPath);
  try {
    initializeCatalog(db);
    const writer = catalogWriter(db);
    const neededAuthors = new Set<string>();
    const importedWorks = new Set<string>();

    for await (const line of readLines(options.worksPath)) {
      const record = parseDumpLine(line);
      if (!record) {
        report.malformed++;
        continue;
      }
      if (!selected.has(record.key)) continue;
      const work = normalizeWork(record);
      if (!work) {
        report.malformed++;
        continue;
      }
      writer.work(work);
      importedWorks.add(work.id);
      for (const authorId of work.authorIds) neededAuthors.add(authorId);
      report.works++;
    }

    for await (const line of readLines(options.authorsPath)) {
      const record = parseDumpLine(line);
      if (!record) {
        report.malformed++;
        continue;
      }
      if (!neededAuthors.has(record.key)) continue;
      const author = normalizeAuthor(record);
      if (!author) {
        report.malformed++;
        continue;
      }
      writer.author(author.id, author.name);
      report.authors++;
    }

    for await (const line of readLines(options.editionsPath)) {
      const record = parseDumpLine(line);
      if (!record) {
        report.malformed++;
        continue;
      }
      const edition = normalizeEdition(record);
      if (!edition) {
        report.malformed++;
        continue;
      }
      if (!importedWorks.has(edition.workId)) {
        report.skipped++;
        continue;
      }
      writer.edition(edition);
      report.editions++;
    }
    return report;
  } finally {
    db.close();
  }
}
