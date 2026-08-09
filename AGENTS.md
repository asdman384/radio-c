<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Project conventions

Radio Calico: a web player for a lossless HLS radio stream. Next.js 16 App Router +
TypeScript + Tailwind 4 + hls.js, with a SQLite scaffold via Node 24's built-in
`node:sqlite`. See `README.md` for how the stream and the player work.

`src/app/` holds routing files only (`page.tsx`, `layout.tsx`, `api/`); UI components
live in `src/components/`, hooks in `src/hooks/`, and data access/utilities in `src/lib/`.

## Player

- **Stream and metadata config lives in `src/lib/stream.ts`.** Never hard-code the
  CloudFront URLs in a component.
- **Playback logic lives in the `src/hooks/use-*.ts` hooks**, not in `radio-player.tsx`.
  `use-hls-player.ts` owns hls.js; the component only renders.
- **Lossless is the default and the point of the project.** The master playlist offers a
  FLAC (fMP4) variant and an AAC (MPEG-TS) fallback. Do not change the default variant, the
  engine-selection logic, or the hls.js buffer settings without a specific reason — the
  Safari-vs-MSE FLAC handling in `use-hls-player.ts` is deliberate and easy to break.
- **hls.js must stay lazily imported** (`await import("hls.js")` inside the mount effect) so
  it never reaches the server bundle.

## Styling

- **Use the brand Tailwind tokens** from `src/app/globals.css` (`mint`, `forest`, `teal`,
  `calico`, `charcoal`, `cream`) rather than raw hex, so `RadioCalico_Style_Guide.txt`
  stays the single source of truth. `RadioCalicoLayout.png` is the reference layout.
- The design is **light-only** by decision; do not add `prefers-color-scheme` branches.

## Database

`db/migrations/001_add_ratings.sql` is the first table: track ratings (👍/👎), one vote per
listener per song, keyed on `trackKey(track)` from `src/lib/stream.ts` plus an `httpOnly`
`rc_listener` cookie. SQL is in `src/lib/ratings.ts`; the route is
`src/app/api/ratings/route.ts`. See `README.md`'s "Track ratings" section for the full
contract.

- **Database access goes through `src/lib/db.ts`.** It exports a cached `DatabaseSync`
  connection plus `all`/`get`/`run`/`transaction` helpers. Never open a second connection.
- **SQL lives in `src/lib/*.ts`**, not in route handlers or components.
- **Always bind parameters** (`all("... WHERE id = ?", id)`); never interpolate values into SQL.
- **Schema changes are new files in `db/migrations/`**, named to sort after the last one. Never
  edit an already-applied migration. Migrations run automatically on first connect, and via
  `npm run db:migrate`.
- **Route handlers must stay on the Node runtime** (the default). `node:sqlite` does not exist
  on the edge runtime, so never add `export const runtime = "edge"` to anything that touches
  the database.
- `scripts/*.mts` run directly under Node — it executes TypeScript natively, so there is no
  build step and no ts-node. Imports there need explicit `.ts` extensions.

## Testing

Vitest is the test runner (`npm test` for a single run, `npm run test:watch` for the dev
loop), configured in `vitest.config.mts`. Test files live under `tests/`, mirroring `src/`
(e.g. `tests/lib/ratings.test.ts` for `src/lib/ratings.ts`), not colocated with the source.

- **The default test environment is `node`**, not `jsdom` — this keeps backend tests (ones
  touching `db.ts`/`ratings.ts`/route handlers) honest about running under real Node. Frontend
  test files opt into the DOM individually with a `// @vitest-environment jsdom` docblock as
  the first line.
- **Backend tests never open a second `DatabaseSync`.** `src/lib/db.ts` caches its connection
  on `globalThis`, keyed by `DATABASE_PATH` read once at import time, so tests must go through
  `tests/support/ratings-db.ts`'s `withFreshDb()`/`teardownFreshDb()` helpers, which close the
  cached connection, point `DATABASE_PATH` at a fresh temp file, and `vi.resetModules()` before
  re-importing `db.ts`/`ratings.ts`. Never write to `data/app.db` from a test.
- **`next/headers`'s `cookies()` throws outside a real request**, so route-handler tests mock
  it (`vi.mock("next/headers", ...)`) with a small fake cookie-jar object rather than calling
  `GET`/`POST` unmocked.
- **`test.globals` is `false`** — every test file imports `describe`/`it`/`expect`/`vi`
  explicitly from `"vitest"`, matching the rest of the codebase's no-barrel-import style.
- `@testing-library/react` is used for component/hook tests already covering the ratings UI
  (`tests/components/track-rating.test.tsx`, `tests/hooks/use-track-rating.test.ts`); there is
  no `@testing-library/jest-dom`, so assert on plain DOM properties (`.disabled`,
  `getAttribute(...)`) rather than `toBeDisabled()`-style matchers.

## Gotchas

- React 19's `react-hooks/set-state-in-effect` rule is enforced and will fail `npm run lint`.
  Derive state during render, reset via `key`, or use `useSyncExternalStore` (see
  `use-persistent-volume.ts`); do not call `setState` synchronously in an effect body.
- Deleting a route under `src/app/api/` leaves stale references in `.next/types/validator.ts`
  that break `npx tsc --noEmit`. Remove `.next/` and rebuild to regenerate them.
- Useful commands: `npm run build`, `npx tsc --noEmit`, `npm run lint`, `npm test`,
  `npm run db:reset`, `npm run db:query "SELECT ..."`.
