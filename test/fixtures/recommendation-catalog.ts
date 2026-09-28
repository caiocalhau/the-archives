import type Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import {
  authors, editions, series, subjects, workAuthors, works, workSeries, workSubjects,
} from '../../src/catalog/schema.js';

export function seedRecommendationCatalog(db: Database.Database): void {
  const orm = drizzle(db);
  orm.insert(works).values([
    { id: '/works/source', title: 'Source Book', source: 'synthetic' },
    { id: '/works/two-themes', title: 'Two Themes', source: 'synthetic' },
    { id: '/works/same-author', title: 'Shared Author', source: 'synthetic' },
    { id: '/works/same-name', title: 'Different Author ID', source: 'synthetic' },
    { id: '/works/series-member', title: 'Series Continuation', source: 'synthetic' },
    { id: '/works/sparse', title: 'Sparse Book', source: 'synthetic' },
  ]).run();
  orm.insert(authors).values([
    { id: '/authors/A', name: 'Example Author' },
    { id: '/authors/C', name: 'Example Author' },
  ]).run();
  orm.insert(workAuthors).values([
    { workId: '/works/source', authorId: '/authors/A' },
    { workId: '/works/same-author', authorId: '/authors/A' },
    { workId: '/works/same-name', authorId: '/authors/C' },
  ]).run();
  orm.insert(subjects).values([
    { id: 'fixture:fantasy', label: 'Fantasy' },
    { id: 'fixture:magic', label: 'Magic' },
    { id: 'fixture:dragons', label: 'Dragons' },
  ]).run();
  const workThemes = [
    ['/works/source', ['fantasy', 'magic', 'dragons']],
    ['/works/two-themes', ['magic', 'dragons']],
    ['/works/same-author', ['fantasy', 'magic']],
    ['/works/same-name', ['fantasy', 'magic']],
    ['/works/series-member', ['magic', 'dragons']],
  ] as const;
  orm.insert(workSubjects).values(workThemes.flatMap(([workId, themes]) =>
    themes.map((theme) => ({ workId, subjectId: `fixture:${theme}` })))).run();
  orm.insert(series).values({ id: '/series/source', name: 'Example Series' }).run();
  orm.insert(workSeries).values([
    { workId: '/works/source', seriesId: '/series/source', position: '1' },
    { workId: '/works/series-member', seriesId: '/series/source', position: '2' },
  ]).run();
  orm.insert(editions).values([
    { id: '/books/first-edition', workId: '/works/two-themes', title: 'Two Themes' },
    { id: '/books/second-edition', workId: '/works/two-themes', title: 'Two Themes: Revised' },
  ]).run();
}
