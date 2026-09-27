CREATE TABLE IF NOT EXISTS works (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  first_publish_year INTEGER,
  source TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS editions (
  id TEXT PRIMARY KEY,
  work_id TEXT NOT NULL REFERENCES works(id),
  title TEXT NOT NULL,
  language TEXT
);

CREATE INDEX IF NOT EXISTS editions_work_id ON editions(work_id);

CREATE TABLE IF NOT EXISTS authors (
  id TEXT PRIMARY KEY,
  name TEXT
);

CREATE TABLE IF NOT EXISTS work_authors (
  work_id TEXT NOT NULL REFERENCES works(id),
  author_id TEXT NOT NULL REFERENCES authors(id),
  PRIMARY KEY (work_id, author_id)
);

CREATE TABLE IF NOT EXISTS series (
  id TEXT PRIMARY KEY,
  name TEXT
);

CREATE TABLE IF NOT EXISTS work_series (
  work_id TEXT NOT NULL REFERENCES works(id),
  series_id TEXT NOT NULL REFERENCES series(id),
  position TEXT,
  PRIMARY KEY (work_id, series_id)
);

CREATE TABLE IF NOT EXISTS subjects (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS work_subjects (
  work_id TEXT NOT NULL REFERENCES works(id),
  subject_id TEXT NOT NULL REFERENCES subjects(id),
  PRIMARY KEY (work_id, subject_id)
);

CREATE VIRTUAL TABLE IF NOT EXISTS work_titles USING fts5(
  work_id UNINDEXED,
  title,
  tokenize = 'unicode61 remove_diacritics 2'
);
