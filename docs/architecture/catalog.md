# Local catalog — first milestone

This milestone validates the data flow before publishing an API: a selection of Open Library work IDs is imported into a local SQLite database, and searches return works rather than one result per edition. The SQLite database and source dumps stay out of Git. The public API, thematic recommendations, and frontend are outside this milestone.

## Data flow

1. `src/catalog/open-library.ts` reads each TSV line and normalizes works, editions, and authors. The parser does not access the database.
2. `src/catalog/import.ts` streams the dumps, including `.gz` files, and imports only the work IDs in `selection.txt`. Malformed lines are counted in the report without interrupting valid records.
3. `src/catalog/schema.ts` defines the relational tables with Drizzle. The versioned SQL in `drizzle/` initializes the local database, including the FTS5 virtual table that Drizzle does not model. Authors, subjects, and series are related to works. Open Library IDs are preserved, and `works.source` records provenance.
4. `src/catalog/import.ts` and `src/catalog/queries.ts` use Drizzle for relational reads and writes. FTS5 index maintenance and title matching remain parameterized SQL. Search returns each work only once. `src/cli.ts` exposes import, search, and details as JSON.

The work/edition distinction follows the [Open Library model](https://openlibrary.org/dev/docs/api/books). The five-column format and monthly dumps are described in the [dump documentation](https://openlibrary.org/developers/dumps). The [SQLite FTS5](https://www.sqlite.org/fts5.html) `unicode61` tokenizer supports case- and accent-insensitive searches for Latin-script titles.

## Try it with synthetic data

With Node.js 24 and dependencies installed:

```bash
nvm use
npm ci
mkdir -p data
npm run catalog -- import \
  --works test/fixtures/works.tsv \
  --editions test/fixtures/editions.tsv \
  --authors test/fixtures/authors.tsv \
  --selection test/fixtures/selection.txt \
  --db data/catalog.db
npm run catalog -- search "lord of the rings" --db data/catalog.db
npm run catalog -- show /works/OL1W --db data/catalog.db
npm test
npm run typecheck
```

`search` accepts a positive integer through `--limit` and defaults to 20. The same `import` command accepts Open Library `.txt.gz` dumps. The selection file contains one `/works/...` key per line. These examples use synthetic data to exercise the flow, not a real catalog or reproduced book descriptions.

## Current decisions and limits

- The title index includes edition titles, so a translated title can find its work without appearing as a separate book. Relevance ranking is not implemented yet.
- The `series` field appears on [Open Library editions](https://openlibrary.org/type/edition). The importer associates it with the work and extracts a position only from an explicit expression such as `Example Series #2`. Missing series and other formats may have no known order.
- Each import upserts by source ID and refreshes the title index. Repeated imports do not duplicate records. Deleting works that disappear from the source is outside this milestone.
- Full dumps are large and must be scanned locally. A small selection limits the resulting database size but does not eliminate the time needed to read the source files.
- `initializeCatalog` applies versioned migrations, including to existing local catalogs created before Drizzle. To change relational tables, edit `src/catalog/schema.ts`, run `npx drizzle-kit generate`, review the generated SQL, and keep FTS5 changes in a custom SQL migration.
- Description search, normalized categories, recommendations, regional preferences, and D1 publication belong to later milestones. Drizzle currently runs against local SQLite; it does not yet connect to D1.
