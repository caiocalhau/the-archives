import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const works = sqliteTable('works', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  firstPublishYear: integer('first_publish_year'),
  source: text('source').notNull(),
});

export const editions = sqliteTable('editions', {
  id: text('id').primaryKey(),
  workId: text('work_id').notNull().references(() => works.id),
  title: text('title').notNull(),
  language: text('language'),
}, (table) => [index('editions_work_id').on(table.workId)]);

export const authors = sqliteTable('authors', {
  id: text('id').primaryKey(),
  name: text('name'),
});

export const workAuthors = sqliteTable('work_authors', {
  workId: text('work_id').notNull().references(() => works.id),
  authorId: text('author_id').notNull().references(() => authors.id),
}, (table) => [primaryKey({ columns: [table.workId, table.authorId] })]);

export const series = sqliteTable('series', {
  id: text('id').primaryKey(),
  name: text('name'),
});

export const workSeries = sqliteTable('work_series', {
  workId: text('work_id').notNull().references(() => works.id),
  seriesId: text('series_id').notNull().references(() => series.id),
  position: text('position'),
}, (table) => [primaryKey({ columns: [table.workId, table.seriesId] })]);

export const subjects = sqliteTable('subjects', {
  id: text('id').primaryKey(),
  label: text('label').notNull(),
});

export const workSubjects = sqliteTable('work_subjects', {
  workId: text('work_id').notNull().references(() => works.id),
  subjectId: text('subject_id').notNull().references(() => subjects.id),
}, (table) => [primaryKey({ columns: [table.workId, table.subjectId] })]);
