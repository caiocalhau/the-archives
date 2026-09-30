import { existsSync } from 'node:fs';
import { openCatalog } from './catalog/db.js';
import { createGoogleBooksProvider } from './catalog/discovery/google-books.js';
import { createOpenLibraryProvider } from './catalog/discovery/open-library.js';
import { discoverBooks, inspectBook } from './catalog/discovery/service.js';
import type { BookSource } from './catalog/discovery/types.js';
import { importCatalog } from './catalog/import.js';
import { getWorkDetails, recommendWorks, searchWorksByTitle } from './catalog/queries.js';

interface ParsedArguments {
  positional: string[];
  options: Map<string, string>;
}

function parseArguments(args: string[]): ParsedArguments {
  const parsed: ParsedArguments = { positional: [], options: new Map() };
  for (let index = 0; index < args.length; index++) {
    const value = args[index];
    if (!value) continue;
    if (!value.startsWith('--')) {
      parsed.positional.push(value);
      continue;
    }
    const next = args[++index];
    if (!next || next.startsWith('--')) throw new Error(`Missing value for ${value}`);
    parsed.options.set(value.slice(2), next);
  }
  return parsed;
}

function requiredOption(options: Map<string, string>, name: string): string {
  const value = options.get(name);
  if (!value) throw new Error(`Missing --${name}`);
  return value;
}

function requiredPosition(values: string[], command: string): string {
  if (values.length !== 1) throw new Error(`Expected one argument for ${command}`);
  return values[0]!;
}

function inspectPosition(values: string[]): { source: BookSource; id: string } {
  if (values.length !== 2) throw new Error('Expected source and ID for inspect');
  const [source, id] = values;
  if (source !== 'local' && source !== 'openlibrary' && source !== 'google') {
    throw new Error(`Invalid book source: ${source}`);
  }
  if (!id || (source === 'openlibrary' && !/^\/works\/OL\d+W$/.test(id))
    || (source === 'google' && !/^[A-Za-z0-9_-]+$/.test(id))) {
    throw new Error('Invalid book ID for source');
  }
  return { source, id };
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  const { positional, options } = parseArguments(args);
  if (command === 'import') {
    const report = await importCatalog({
      dbPath: requiredOption(options, 'db'),
      worksPath: requiredOption(options, 'works'),
      editionsPath: requiredOption(options, 'editions'),
      authorsPath: requiredOption(options, 'authors'),
      selectionPath: requiredOption(options, 'selection'),
    });
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  if (command === 'discover' || command === 'inspect') {
    const title = command === 'discover' ? requiredPosition(positional, command) : null;
    const selected = command === 'inspect' ? inspectPosition(positional) : null;
    if (title !== null && !title.trim()) throw new Error('Expected a non-empty title');
    const dbPath = requiredOption(options, 'db');
    if (!existsSync(dbPath)) throw new Error(`Database not found: ${dbPath}`);
    const db = openCatalog(dbPath);
    try {
      const providers = {
        openlibrary: createOpenLibraryProvider({
          contactEmail: process.env.OPEN_LIBRARY_CONTACT_EMAIL,
        }),
        google: createGoogleBooksProvider({ apiKey: process.env.GOOGLE_BOOKS_API_KEY }),
      };
      if (title !== null) {
        console.log(JSON.stringify(await discoverBooks(db, title, providers), null, 2));
      } else if (selected) {
        const details = await inspectBook(db, selected.source, selected.id, providers);
        if (!details) throw new Error(`Work not found: ${selected.id}`);
        console.log(JSON.stringify(details, null, 2));
      }
    } finally {
      db.close();
    }
    return;
  }
  if (command === 'search' || command === 'show' || command === 'recommend') {
    const value = requiredPosition(positional, command);
    const dbPath = requiredOption(options, 'db');
    if (!existsSync(dbPath)) throw new Error(`Database not found: ${dbPath}`);
    const db = openCatalog(dbPath);
    try {
      if (command === 'search') {
        const limit = Number(options.get('limit') ?? 20);
        console.log(JSON.stringify(searchWorksByTitle(db, value, limit), null, 2));
      } else if (command === 'recommend') {
        const limit = Number(options.get('limit') ?? 10);
        const recommendations = recommendWorks(db, value, limit);
        if (!recommendations) throw new Error(`Work not found: ${value}`);
        console.log(JSON.stringify(recommendations, null, 2));
      } else {
        const details = getWorkDetails(db, value);
        if (!details) throw new Error(`Work not found: ${value}`);
        console.log(JSON.stringify(details, null, 2));
      }
    } finally {
      db.close();
    }
    return;
  }
  throw new Error('Usage: catalog <import|search|show|recommend|discover|inspect> [arguments]');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
