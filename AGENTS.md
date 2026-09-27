# The Archives: agent guidance

- Read `README.md` for the project's current scope and local usage. Do not
  describe planned features as already available.
- Consult `docs/architecture/catalog.md` when changing catalog imports, schema,
  or queries. Update it when the documented data flow or decisions change.
- Keep code and repository documentation in English, and follow the existing
  Node.js 24, TypeScript, and SQLite conventions.
- Run `npm test` and `npm run typecheck` after code changes.
- Update `README.md` when delivered capabilities or setup instructions change.
  Review `CHANGELOG.md` for each pull request and record notable changes under
  `[Unreleased]`, linking the PR when its number is known. A merge is not a
  release.
- Do not commit downloaded dumps, local databases, or `docs/superpowers/`,
  including by force-adding ignored files.
