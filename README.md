# The Archives

A personal project for discovering books through the stories and interests you
already love.

## Why I started it

I have loved reading since childhood. My parents helped start that relationship
by buying me *Turma da Mônica* comics. As life grew busier, reading gradually
became a less frequent part of my life. Recently, I found my way back to it—but
I also realized how much I had missed. What was happening in the world of books?
Which new releases were worth exploring? Where should I start?

I asked friends for recommendations and followed people who share what they
read. Then I began to wonder: what if I could start with something I already
love - a book, comic, manga, film, or series - and discover books that capture
something similar?

That question became The Archives. This project marks my return to reading. It
is also a way to keep learning while building something I genuinely want to
use. I am starting small and will grow it one working piece at a time.

## The idea

Book discovery should not depend on already knowing the right title or staying
within the same culture, language, or category. The Archives is meant to help
someone explore a broad catalog of books and find a next read through a title,
a theme, or a story they enjoyed elsewhere.

## The goal

The long-term goal is a personal book-discovery space: a catalog that brings
together useful information about books, helps people navigate related works
and book series, and offers recommendations that make sense for their interests.
Regional and language preferences should help make results relevant without
turning the catalog into a collection with borders.

## Where I want to take it

The intended experience includes searching for a book by title and seeing its
description, author, subjects, editions, and place in a series alongside related
books. It should also be possible to describe the kind of story one wants and
find books that fit. Further ahead, other media—such as comics, manga, films,
and TV series—could become starting points for book recommendations, with
personal reading lists supporting discovery over time.

These are goals, not features already available in this repository.

## Where it stands today

The current milestone is a **local catalog foundation**, not a published site
or a recommendation engine. It can:

- Import selected works, editions, and authors from Open Library dumps into a
  local SQLite database.
- Store work details, subjects, editions, and book-series information when the
  source provides them.
- Search work and edition titles and return one result per work.
- Show work details through a JSON-output command-line interface.

It does not yet search descriptions or themes, recommend books, maintain user
profiles or reading lists, or offer an API or web interface. Importing selected
records is also not the same as hosting a complete worldwide catalog.

## Try the local catalog

Use Node.js 24 and install dependencies with `npm ci`. The example below uses
synthetic test data; it does not download the full Open Library catalog.

```bash
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
```

Run `npm test` and `npm run typecheck` to validate the current code. For the
data flow, design decisions, and limitations, see
[the catalog architecture](docs/architecture/catalog.md). Notable changes are
tracked in the [changelog](CHANGELOG.md).
