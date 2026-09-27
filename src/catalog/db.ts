import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

const migrationsFolder = fileURLToPath(new URL('../../drizzle/', import.meta.url));

export function openCatalog(path: string): Database.Database {
  const db = new Database(path);
  db.pragma('foreign_keys = ON');
  return db;
}

export function initializeCatalog(db: Database.Database): void {
  migrate(drizzle(db), { migrationsFolder });
}
