import { existsSync } from 'node:fs';
import { openCatalog } from './catalog/db.js';
import { importCatalog } from './catalog/import.js';
import { getWorkDetails, searchWorksByTitle } from './catalog/queries.js';

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
  if (command === 'search' || command === 'show') {
    const value = requiredPosition(positional, command);
    const dbPath = requiredOption(options, 'db');
    if (!existsSync(dbPath)) throw new Error(`Database not found: ${dbPath}`);
    const db = openCatalog(dbPath);
    try {
      if (command === 'search') {
        const limit = Number(options.get('limit') ?? 20);
        console.log(JSON.stringify(searchWorksByTitle(db, value, limit), null, 2));
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
  throw new Error('Usage: catalog <import|search|show> [arguments]');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
