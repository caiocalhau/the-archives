# Catálogo local — primeira etapa

Esta etapa prova o caminho dos dados antes de publicar uma API: uma seleção de IDs de obras da Open Library entra em um banco SQLite local; a busca devolve obras, não uma linha por edição. O arquivo SQLite e os dumps ficam fora do Git. A API pública, a recomendação temática e o frontend ainda não fazem parte desta etapa.

## Fluxo dos dados

1. `src/catalog/open-library.ts` lê cada linha TSV e normaliza obras, edições e autores. O parser não acessa o banco.
2. `src/catalog/import.ts` percorre os dumps em streaming, inclusive arquivos `.gz`, e importa somente os IDs de `selection.txt`. Linhas inválidas são contadas no relatório e não interrompem os registros válidos.
3. `src/catalog/schema.sql` separa `works` de `editions`. Autores, assuntos e séries são relações da obra. IDs da Open Library são preservados; `works.source` registra a procedência.
4. `src/catalog/queries.ts` consulta um índice FTS5 para títulos de obras e edições, mas retorna cada obra uma vez. `src/cli.ts` expõe importação, busca e detalhes em JSON.

A separação obra/edição segue o [modelo da Open Library](https://openlibrary.org/dev/docs/api/books). O formato de cinco colunas e os dumps mensais estão descritos na [documentação dos dumps](https://openlibrary.org/developers/dumps). O tokenizer `unicode61` do [SQLite FTS5](https://www.sqlite.org/fts5.html) permite a busca por títulos latinos com diferença de caixa e acentos.

## Experimentar com dados sintéticos

Com Node.js 24 e as dependências instaladas:

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
npm run catalog -- search "senhor dos aneis" --db data/catalog.db
npm run catalog -- show /works/OL1W --db data/catalog.db
npm test
npm run typecheck
```

`search` aceita `--limit` com um inteiro positivo; o padrão é 20. O mesmo comando `import` aceita dumps `.txt.gz` da Open Library. A seleção contém uma chave `/works/...` por linha. Os exemplos são dados sintéticos para exercitar o fluxo, não um catálogo real nem descrições de livros reproduzidas.

## Decisões e limites atuais

- O índice de títulos inclui nomes das edições; isso permite encontrar uma tradução sem mostrá-la como um livro separado. O ranqueamento por relevância ainda será desenvolvido.
- O campo `series` aparece nas [edições da Open Library](https://openlibrary.org/type/edition). O importador associa essa informação à obra; só extrai a posição de uma expressão explícita como `Nome da série #2`. Séries ausentes ou em outros formatos ainda podem ficar sem ordem conhecida.
- Cada importação faz upsert por ID de origem e atualiza os títulos no índice. Ela pode ser repetida sem duplicar registros. A remoção de obras que deixaram de existir na origem não é tratada nesta etapa.
- Os dumps completos são grandes e precisam ser percorridos localmente. Uma seleção pequena limita o banco produzido, mas não elimina o tempo de leitura dos arquivos de origem.
- Busca descritiva, categorias normalizadas, recomendações, preferência regional e publicação no D1 pertencem às próximas etapas. O catálogo local é a base verificável para elas.
