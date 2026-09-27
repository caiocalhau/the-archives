import { readFileSync } from 'node:fs';
import Database from 'better-sqlite3';

const schema = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');

export function openCatalog(path: string): Database.Database {
  const db = new Database(path);
  db.pragma('foreign_keys = ON');
  return db;
}

export function initializeCatalog(db: Database.Database): void {
  db.exec(schema);
}
