# Changelog

All notable changes to The Archives are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Read-only `catalog discover` and `catalog inspect` commands that use local
  title search first, then Open Library and optional Google Books candidates.
  Display source-labeled details and provider outcomes without storing external
  responses or changing local recommendations
  ([#4](https://github.com/caiocalhau/the-archives/pull/4)).
- Deterministic tests for title matching, provider errors and limits,
  local-first fallback, inspection, CLI validation, and database preservation
  ([#4](https://github.com/caiocalhau/the-archives/pull/4)).
- Explainable local recommendations through `catalog recommend`, using a small
  explicit theme vocabulary and shared author IDs. Rank distinct works with
  catalog evidence, exclude known same-series works, and return empty results
  when thematic evidence is insufficient
  ([#3](https://github.com/caiocalhau/the-archives/pull/3)).
- Synthetic recommendation tests covering normalization, scoring, database
  integration, CLI limits and errors, and preservation of source metadata
  ([#3](https://github.com/caiocalhau/the-archives/pull/3)).
- A local SQLite catalog that distinguishes works from editions and stores
  authors, subjects, book-series membership, and source provenance
  ([#1](https://github.com/caiocalhau/the-archives/pull/1)).
- Selective, streaming import of Open Library work, edition, and author dumps,
  including gzip files, with repeatable updates and malformed-record reporting
  ([#1](https://github.com/caiocalhau/the-archives/pull/1)).
- Full-text title search across works and editions that returns one result per
  work, plus work details and JSON-based catalog commands
  ([#1](https://github.com/caiocalhau/the-archives/pull/1)).
- Synthetic fixtures, automated tests, and architecture documentation for the
  local catalog workflow ([#1](https://github.com/caiocalhau/the-archives/pull/1)).

### Changed

- Define the local catalog's relational schema with Drizzle and apply versioned
  migrations. Use typed relational queries for imports and work details while
  retaining SQL for FTS5 title search and index maintenance
  ([#2](https://github.com/caiocalhau/the-archives/pull/2)).
- Pin direct dependencies to installed versions and configure npm to save
  exact versions for future additions
  ([#2](https://github.com/caiocalhau/the-archives/pull/2)).

### Fixed

- Preserve catalog consistency when imported records are updated, and handle
  Unicode title queries correctly ([#1](https://github.com/caiocalhau/the-archives/pull/1)).
