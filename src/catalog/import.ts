import { createReadStream, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { PassThrough } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';
import type Database from 'better-sqlite3';
import { initializeCatalog, openCatalog } from './db.js';
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
  const upsertWorkRow = db.prepare(`
    INSERT INTO works(id, title, description, first_publish_year, source)
    VALUES (?, ?, ?, ?, 'openlibrary')
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      description = excluded.description,
      first_publish_year = excluded.first_publish_year
  `);
  const upsertEditionRow = db.prepare(`
    INSERT INTO editions(id, work_id, title, language) VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      work_id = excluded.work_id,
      title = excluded.title,
      language = excluded.language
  `);
  const previousEditionParent = db.prepare('SELECT work_id FROM editions WHERE id = ?');
  const upsertAuthorRow = db.prepare(`
    INSERT INTO authors(id, name) VALUES (?, ?)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name
  `);
  const ensureAuthor = db.prepare('INSERT OR IGNORE INTO authors(id) VALUES (?)');
  const linkAuthor = db.prepare('INSERT OR IGNORE INTO work_authors(work_id, author_id) VALUES (?, ?)');
  const upsertSubject = db.prepare(`
    INSERT INTO subjects(id, label) VALUES (?, ?)
    ON CONFLICT(id) DO UPDATE SET label = excluded.label
  `);
  const linkSubject = db.prepare('INSERT OR IGNORE INTO work_subjects(work_id, subject_id) VALUES (?, ?)');
  const upsertSeries = db.prepare(`
    INSERT INTO series(id, name) VALUES (?, ?)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name
  `);
  const linkSeries = db.prepare(`
    INSERT INTO work_series(work_id, series_id, position) VALUES (?, ?, ?)
    ON CONFLICT(work_id, series_id) DO UPDATE SET
      position = COALESCE(work_series.position, excluded.position)
  `);
  const deleteAuthors = db.prepare('DELETE FROM work_authors WHERE work_id = ?');
  const deleteSubjects = db.prepare('DELETE FROM work_subjects WHERE work_id = ?');
  const deleteSeries = db.prepare('DELETE FROM work_series WHERE work_id = ?');
  const deleteTitles = db.prepare('DELETE FROM work_titles WHERE work_id = ?');
  const selectWorkTitle = db.prepare('SELECT title FROM works WHERE id = ?');
  const selectEditionTitles = db.prepare('SELECT title FROM editions WHERE work_id = ?');
  const insertTitle = db.prepare('INSERT INTO work_titles(work_id, title) VALUES (?, ?)');

  const refreshTitles = (workId: string): void => {
    deleteTitles.run(workId);
    const work = selectWorkTitle.get(workId) as { title: string } | undefined;
    if (work) insertTitle.run(workId, work.title);
    const editions = selectEditionTitles.all(workId) as { title: string }[];
    for (const edition of editions) insertTitle.run(workId, edition.title);
  };

  const addSeries = (workId: string, entries: NormalizedSeries[]): void => {
    for (const entry of entries) {
      upsertSeries.run(entry.id, entry.name);
      linkSeries.run(workId, entry.id, entry.position);
    }
  };

  return {
    work: db.transaction((work: NormalizedWork) => {
      upsertWorkRow.run(work.id, work.title, work.description, work.firstPublishYear);
      deleteAuthors.run(work.id);
      for (const authorId of work.authorIds) {
        ensureAuthor.run(authorId);
        linkAuthor.run(work.id, authorId);
      }
      deleteSubjects.run(work.id);
      for (const label of work.subjects) {
        const id = `openlibrary:subject:${label.replace(/\s+/g, ' ').toLowerCase()}`;
        upsertSubject.run(id, label);
        linkSubject.run(work.id, id);
      }
      deleteSeries.run(work.id);
      addSeries(work.id, work.series);
      refreshTitles(work.id);
    }),
    edition: db.transaction((edition: NormalizedEdition) => {
      const previous = previousEditionParent.get(edition.id) as { work_id: string } | undefined;
      upsertEditionRow.run(edition.id, edition.workId, edition.title, edition.language);
      addSeries(edition.workId, edition.series);
      refreshTitles(edition.workId);
      if (previous && previous.work_id !== edition.workId) refreshTitles(previous.work_id);
    }),
    author: db.transaction((id: string, name: string) => {
      upsertAuthorRow.run(id, name);
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
