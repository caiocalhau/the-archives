# Changelog

All notable changes to The Archives are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

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

### Fixed

- Preserve catalog consistency when imported records are updated, and handle
  Unicode title queries correctly ([#1](https://github.com/caiocalhau/the-archives/pull/1)).
