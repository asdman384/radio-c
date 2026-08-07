<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Project conventions

Local prototype: Next.js 16 App Router + SQLite through Node 24's built-in `node:sqlite`.

- **Database access goes through `src/lib/db.ts`.** It exports a cached `DatabaseSync`
  connection plus `all`/`get`/`run`/`transaction` helpers. Never open a second connection.
- **SQL lives in `src/lib/*.ts`**, not in route handlers or components. See `src/lib/items.ts`
  for the shape.
- **Always bind parameters** (`all("... WHERE id = ?", id)`); never interpolate values into SQL.
- **Schema changes are new files in `db/migrations/`**, named to sort after the last one. Never
  edit an already-applied migration. Migrations run automatically on first connect, and via
  `npm run db:migrate`.
- **Route handlers must stay on the Node runtime** (the default). `node:sqlite` does not exist
  on the edge runtime, so never add `export const runtime = "edge"` to anything that touches
  the database.
- `scripts/*.mts` run directly under Node — it executes TypeScript natively, so there is no
  build step and no ts-node. Imports there need explicit `.ts` extensions.
- Useful commands: `npm run db:reset`, `npm run db:query "SELECT ..."`, `npx tsc --noEmit`.
