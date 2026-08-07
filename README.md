# radio

Local prototyping stack: **Next.js 16** (App Router, TypeScript) + **SQLite** via Node 24's
built-in `node:sqlite`. No database server, no native modules, no build step for the tooling.

## Getting started

```bash
npm install       # once
npm run db:reset  # create data/app.db, run migrations, load seed data
npm run dev       # http://localhost:3000
```

The home page lists rows from the `items` table and adds new ones through the API, so if it
renders you know the whole path — page → route handler → SQLite → back — is wired up.

## How the database is set up

- **Driver:** `node:sqlite`, built into Node 24. Nothing to install, nothing to compile.
  The API is synchronous, which is fine here: the database is a local file and queries return
  in microseconds.
- **File:** `data/app.db` (gitignored). Override with `DATABASE_PATH` in `.env.local`.
- **Connection:** a single cached `DatabaseSync` in `src/lib/db.ts`. It is stashed on
  `globalThis` because Next's dev server re-evaluates modules on every edit — without the
  cache each hot reload would leak a connection.
- **Pragmas:** WAL journaling (so the dev server and CLI scripts do not lock each other out),
  foreign keys on, 5s busy timeout.
- **Migrations run automatically** the first time the app opens the database, so `npm run dev`
  on a clean checkout just works.

## Changing the schema

Add a new file to `db/migrations/`, named so it sorts after the last one:

```
db/migrations/001_init.sql
db/migrations/002_add_stations.sql   <- your new file
```

Each file runs once, in filename order, inside its own transaction, and is recorded in the
`_migrations` table. **Do not edit a migration that has already been applied** — add another
one. If you are still churning on the schema and do not care about the data, editing in place
and running `npm run db:reset` is faster.

Update `db/seed.sql` alongside it. Seeds are written to be idempotent (they clear before
inserting), so they can be re-run freely.

## Database commands

| Command | What it does |
| --- | --- |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:seed` | Load `db/seed.sql` |
| `npm run db:reset` | Drop every table, re-migrate, re-seed |
| `npm run db:query "SELECT * FROM items"` | Run one-off SQL and print a table |

`db:reset` drops tables rather than deleting the `.db` file, so it works while `npm run dev`
is running — on Windows the file is locked while the server holds it open.

There is no `sqlite3` CLI installed; `npm run db:query` covers ad-hoc inspection. If you want
a GUI, [DB Browser for SQLite](https://sqlitebrowser.org/) opens `data/app.db` directly.

## Where things live

```
db/migrations/       schema, one .sql file per change
db/seed.sql          development seed data
scripts/db.mts       database CLI (Node runs TypeScript natively, no build)
src/lib/db.ts        connection, pragmas, migration runner, query helpers
src/lib/items.ts     data access for the demo table -- SQL lives here, not in routes
src/app/page.tsx     server component, reads SQLite directly
src/app/api/items/   REST route handlers (GET/POST, GET/PATCH/DELETE by id)
```

Two ways to read data, both wired up — pick per feature:

- **Server components** call `src/lib/*` directly. No fetch, no waterfall. Best for page loads.
- **Route handlers** under `src/app/api/`. Needed for client-side mutations and anything
  external that will call in.

## Conventions worth keeping

- SQL belongs in `src/lib/*.ts`, not in route handlers or components.
- Route handlers must stay on the Node runtime (the default). `node:sqlite` cannot run on the
  edge runtime.
- Use the parameterised helpers (`all`, `get`, `run`, `transaction`) from `src/lib/db.ts`
  rather than interpolating values into SQL strings.

## Replacing the placeholder

`items` exists only to prove the plumbing. When you have the real schema, delete
`src/lib/items.ts`, `src/app/api/items/`, `src/app/add-item-form.tsx`, and the body of
`src/app/page.tsx`, then either edit `001_init.sql` and reset, or add `002_*.sql`.
