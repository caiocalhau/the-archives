# Local catalog and recommendation baseline

The local catalog validates the data flow before publishing an API: a selection of Open Library work IDs is imported into SQLite, and title searches return works rather than one result per edition. An initial recommendation baseline compares explicitly normalized subjects and authorship. Read-only CLI discovery can now consult Open Library and Google Books when local coverage is missing; it does not grow the catalog. The SQLite database and source dumps stay out of Git. The public API, descriptive search, personalized ranking, and frontend are not implemented.

## Data flow

1. `src/catalog/open-library.ts` reads each TSV line and normalizes works, editions, and authors. The parser does not access the database.
2. `src/catalog/import.ts` streams the dumps, including `.gz` files, and imports only the work IDs in `selection.txt`. Malformed lines are counted in the report without interrupting valid records.
3. `src/catalog/schema.ts` defines the relational tables with Drizzle. The versioned SQL in `drizzle/` initializes the local database, including the FTS5 virtual table that Drizzle does not model. Authors, subjects, and series are related to works. Open Library IDs are preserved, and `works.source` records provenance.
4. `src/catalog/import.ts` and `src/catalog/queries.ts` use Drizzle for relational reads and writes. FTS5 index maintenance and title matching remain parameterized SQL. Search returns each work only once. `src/cli.ts` exposes import, search, and details as JSON.
5. `recommendWorks` in `src/catalog/queries.ts` checks the selected work and loads work, subject, author-ID, and series-ID relations through five bulk/lookup queries, independent of candidate count. It builds one plain record per work and calls the pure engine in `src/catalog/recommendations.ts`. `src/catalog/themes.ts` maps explicit aliases without changing stored subjects. The CLI exposes `recommend` as a JSON array.
6. `src/catalog/discovery/service.ts` coordinates `discover` and `inspect` without writes. `discover` reuses local title search, asks Open Library only after a local miss, and asks Google Books only after an Open Library miss or error. Adapters in `src/catalog/discovery/` parse provider JSON, validate IDs and titles, cap results, and return source-labeled records. `inspect` fetches a selected result by its source ID and, when metadata is absent, keeps cross-source candidates separate rather than inferring identity. The existing recommendation engine only accepts local catalog works.

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
npm run catalog -- recommend /works/OL1W --db data/catalog.db --limit 10
npm run catalog -- discover "lord of the rings" --db data/catalog.db
npm run catalog -- inspect local /works/OL1W --db data/catalog.db
npm test
npm run typecheck
```

`search` accepts a positive integer through `--limit` and defaults to 20. The same `import` command accepts Open Library `.txt.gz` dumps. The selection file contains one `/works/...` key per line. These examples use synthetic data to exercise the flow, not a real catalog or reproduced book descriptions.

The original fixture produces no eligible recommendations, so the command above returns `[]`. `npm test -- test/recommend-cli.test.ts` builds an isolated, non-empty synthetic recommendation catalog and checks CLI output, limits, failures, and database preservation. It does not download records or demonstrate real-book relevance.

For live discovery, `discover <title>` consults at most five candidates per external provider and accepts only a contiguous whole-word title or matching-edition-title sequence after NFKC normalization. It does not translate titles or infer cross-source identity. `inspect <source> <id>` shows the selected book's details and per-provider outcomes, not recommendations. A local work with both description and subjects needs no network lookup; a broad subject still counts as present. A sparse local Open Library work may show direct same-ID provider details without modifying its stored record. Other matches remain candidates with distinct source IDs. Missing fields stay missing.

Network requests are sequential, have a five-second timeout each, and do not retry. Open Library requests follow its identification and in-process anonymous throttling guidance. Google Books is skipped without `GOOGLE_BOOKS_API_KEY`; when configured, the key travels only in a request header. The CLI has no public request limiter. External responses are never persisted; per-field storage rights and deduplication rules must be evaluated before incorporation. Records identify their source through `source` and `id`; provider page links are not part of the discovery model. The test suite uses fake provider responses rather than live network calls.

## Recommendation rules and evidence

The vocabulary has eight canonical themes with reviewed specificity classes and explicit English aliases:

| Theme | Class | Accepted labels |
| --- | --- | --- |
| Fiction | Broad | Fiction |
| Fantasy | Broad | Fantasy, Fantasy fiction |
| Adventure | Broad | Adventure, Adventure fiction |
| Magic | Specific | Magic |
| Dragons | Specific | Dragon, Dragons |
| Vampires | Specific | Vampire, Vampires |
| Coming of age | Specific | Coming of age, Coming-of-age fiction |
| Political intrigue | Specific | Political intrigue |

Matching uses NFC Unicode normalization, trimming, whitespace collapse, and lowercasing. It preserves accents and requires an exact normalized alias. Canonical IDs are deduplicated. Unmapped or merely related labels do not generate evidence; the algorithm does not extract themes from descriptions or translate labels. Raw source subjects remain available through work details.

Each shared broad theme scores 1, each shared specific theme scores 3, and one or more shared author IDs add 1 in total. Eligibility requires at least one shared specific theme. Authorship is determined by source ID, not name. The heuristic may favor works with richer metadata; these scores are not calibrated probabilities or quality ratings.

The engine excludes the selected work and any work sharing a known series ID. Missing series data is not interpreted as proof of unrelatedness, and the engine does not infer membership or order. Series remain explicit catalog relations rather than thematic suggestions. Editions never enter the scoring engine.

Results contain `id`, `title`, `score`, `sharedThemes` with canonical ID/label/weight, and `sharedAuthorIds`. Evidence lists use ascending ID order. Ranking uses descending score, then ordinary string ordering of work IDs, with no locale-dependent tie-breaker. The limit defaults to 10 in the CLI and must be a positive integer. A known work with insufficient evidence returns `[]`; an unknown work returns `null` from the adapter and becomes a CLI error. Missing databases and invalid limits also produce nonzero exits. The command never initializes or migrates a database.

The pure engine knows neither SQLite nor Drizzle. The adapter currently loads the small local catalog into memory; scalable candidate retrieval, D1 execution, and vector indexes are separate future decisions. Synthetic tests verify rules and explanations, not the quality of a real catalog. Before adding signals, distinguish missing metadata, unmapped labels, and ranking issues using a shared evaluation set.

## Current decisions and limits

- The title index includes edition titles, so a translated title can find its work without appearing as a separate book. Relevance ranking is not implemented yet.
- The `series` field appears on [Open Library editions](https://openlibrary.org/type/edition). The importer associates it with the work and extracts a position only from an explicit expression such as `Example Series #2`. Missing series and other formats may have no known order.
- Each import upserts by source ID and refreshes the title index. Repeated imports do not duplicate records. Deleting works that disappear from the source is outside this milestone.
- Full dumps are large and must be scanned locally. A small selection limits the resulting database size but does not eliminate the time needed to read the source files.
- `initializeCatalog` applies versioned migrations, including to existing local catalogs created before Drizzle. To change relational tables, edit `src/catalog/schema.ts`, run `npx drizzle-kit generate`, review the generated SQL, and keep FTS5 changes in a custom SQL migration.
- Description/free-text search, broader category normalization, personalized recommendations, regional preferences, and D1 publication belong to later milestones. Descriptions do not have recorded language; edition language must not be used to infer it. Embeddings and RAG are not implemented. Drizzle currently runs against local SQLite; it does not yet connect to D1.
