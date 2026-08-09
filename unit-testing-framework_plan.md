# Unit testing framework for the ratings system (frontend + backend)

## Context

The repo has zero test infrastructure today (no jest/vitest/mocha, no config, no `*.test.*` outside `node_modules`). The user wants a unit testing framework covering the track-ratings feature end to end: the backend (`src/lib/ratings.ts`, `src/app/api/ratings/route.ts`, backed by `node:sqlite` via `src/lib/db.ts`) and the frontend (`src/hooks/use-track-rating.ts`, `src/components/track-rating.tsx`). The goal of this pass is the framework itself plus tests for the ratings vertical slice — not a sweep of the whole player surface (that's called out as follow-up scope).

User decisions already made: tests live in a **dedicated `tests/` directory** mirroring `src/` (not colocated), and **no CI workflow** is added in this pass.

## Runner: Vitest 4.x

Chosen over Node's built-in `node:test` because this project needs one runner for both tracks, and `node:test` has no path-alias resolution (`@/*` → `./src/*`) and no JSX/TSX transform — it would need a second tool bolted on for the frontend half anyway. Vitest also happens to be Next 16's own documented App-Router testing path (`node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md`).

Config default environment is `"node"` (not `"jsdom"`), so backend tests fail loudly if they accidentally need DOM shims; frontend test files opt into jsdom individually via a `// @vitest-environment jsdom` docblock. `test.globals` stays `false` — every test file explicitly imports from `"vitest"`, matching this codebase's no-barrel-import style; no `tsconfig.json` edit needed as a result.

**Install:**
```
npm install -D vitest@^4 @vitejs/plugin-react@^6 vite-tsconfig-paths@^6 jsdom@^30 @testing-library/react@^16 @testing-library/dom@^10
```

**`vitest.config.mts`** (new, root):
```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: "node",
    globals: false,
    setupFiles: ["./vitest.setup.ts"],
    include: ["tests/**/*.{test,spec}.{ts,tsx}"],
    css: false,
  },
});
```

**`vitest.setup.ts`** (new, root) — just wires Testing Library's cleanup since `globals: false` means its auto-cleanup detection never fires on its own:
```ts
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});
```

**`package.json` scripts to add:**
```json
"test": "vitest run",
"test:watch": "vitest",
```
(`vitest run` for the bare `npm test` so it exits instead of watching forever.)

## Backend DB isolation (the one real trap)

`src/lib/db.ts` caches its `DatabaseSync` on `globalForDb.__appDb ??= openDatabase()` against the **real `globalThis`**, keyed by `process.env.DATABASE_PATH` read at import time. Setting the env var after the module has already loaded does nothing, and Vitest doesn't reset `globalThis` between `it()`s in the same file. Both backend test files need a shared helper that:
1. Closes/deletes any cached `globalThis.__appDb` from a prior run.
2. Points `DATABASE_PATH` at a fresh `mkdtempSync` SQLite file.
3. Calls `vi.resetModules()` so a dynamic `import("@/lib/db")` re-evaluates against the new path.
4. Returns the fresh `db`/`ratings` bindings; a matching teardown closes the connection and removes the temp dir.

This never opens a second `DatabaseSync` and never touches `db/migrations/001_add_ratings.sql` — migrations still run exactly as they do in production, through `db.ts`'s own `migrate()`.

New file: **`tests/support/ratings-db.ts`** — exports `withFreshDb()` / `teardownFreshDb()` implementing the above. Each backend test file calls it once in `beforeAll`/`afterAll`; individual `it()`s stay isolated from each other by using unique `trackKey`/`listenerId` values rather than resetting per-test.

`route.test.ts` additionally mocks `next/headers`, since `cookies()` throws outside Next's request-scoped async storage:
```ts
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
```
with a small fake in-memory cookie jar assigned per test via `vi.mocked(cookies).mockResolvedValue(...)` to model "first visit" vs "returning listener" vs "second browser."

## Frontend setup

`track-rating.test.tsx` and `use-track-rating.test.ts` both start with `// @vitest-environment jsdom` and use `@testing-library/react` (`render`/`screen`/`renderHook`/`fireEvent`) — needed regardless for the component, reused for the hook via `renderHook` for consistency (no extra `react-hooks` package needed, it's bundled in RTL v16+). `@/` alias and `.tsx` resolve automatically via `vite-tsconfig-paths` + `@vitejs/plugin-react`, no extra config.

## Files to create

- `vitest.config.mts`, `vitest.setup.ts` — root config
- `tests/support/ratings-db.ts` — shared DB isolation helper
- `tests/lib/ratings.test.ts`
- `tests/app/api/ratings/route.test.ts`
- `tests/hooks/use-track-rating.test.ts`
- `tests/components/track-rating.test.tsx`
- `package.json` — new devDependencies + `test`/`test:watch` scripts

### `tests/lib/ratings.test.ts`
- `getTotals` on an untouched track returns `{ up: 0, down: 0 }`.
- First `rate()` call: `accepted: true`, snapshot matches the submitted value, totals move by one.
- Second `rate()` call for the same track+listener (even with the opposite value) returns `accepted: false` with the original snapshot unchanged — proves `ON CONFLICT DO NOTHING` blocks vote changes.
- Two distinct listeners on the same track both get `accepted: true` and totals accumulate.
- `getSnapshot(trackKey, null)` returns real totals with `myRating: null`; `getMyRating` is `null` for a non-voter.
- `isRatingValue` boundaries: `1`/`-1` → true; `0`, `2`, `"1"`, `null`, `undefined` → false.

### `tests/app/api/ratings/route.test.ts`
- `GET` with missing/over-length `trackKey` → 400 `invalid_track_key`.
- `GET` from a fresh listener → 200 with zeroed snapshot, and `cookies().set` called once with `rc_listener`/`httpOnly`/`sameSite: "lax"`/correct `maxAge`.
- `GET` reusing an existing cookie does not re-mint (`set` not called again).
- `POST` with unparsable JSON → 400 `invalid_json`.
- `POST` with bad `trackKey`/`value` → 400 with the matching error code.
- `POST` happy path → 201, correct totals, `artist`/`title` truncated past 200 chars rather than rejected.
- `POST` duplicate vote (same cookie jar) → 409 `already_rated` with the original totals still in the body.
- `POST` from a second, cookie-less caller on the same track → 201, totals reflect both votes.

### `tests/hooks/use-track-rating.test.ts`
- Starts `loading: true`; reflects the mocked fetch's snapshot once resolved.
- Switching `trackKey` while the previous fetch is in flight never lets the stale snapshot leak into the new key.
- `submit(1)` posts the right body, toggles `pending` around the call, and updates state from the response.
- `submit` treats HTTP 409 as success (state still updates, nothing throws).
- Calling `submit` again once `myRating` is already set is a no-op (no fetch call).
- A rejected fetch leaves `pending: false` without throwing.

### `tests/components/track-rating.test.tsx`
- Renders `up`/`down` counts and matching `aria-label`s.
- `myRating === 1` → up button `aria-pressed="true"`, both buttons locked/disabled; mirrored for `-1`.
- `myRating === null`, not loading/pending → neither disabled; clicking calls `rating.submit(1)`/`(-1)`.
- `loading`/`pending` true with `myRating: null` → both disabled for a different reason than "locked" (assert distinctly).
- The `aria-live="polite"` region's text reflects the counts.

## Docs update (per CLAUDE.md: update AGENTS.md/README for infra changes)

After the framework is in place, add a short "Testing" section to `AGENTS.md` (runner, `tests/` convention, DB isolation helper, `npm test`/`npm run test:watch`) and mention `npm test` in `README.md`'s status/commands section.

## Deferred / out of scope for this pass

- CI workflow (explicitly declined by the user for now).
- Coverage tooling (`@vitest/coverage-v8`) — easy to add later if wanted.
- Testing the rest of the player surface (`stream.ts`, `use-hls-player.ts`, `use-now-playing.ts`, `use-persistent-volume.ts`, presentational components, `radio-player.tsx`) — flagged as natural follow-up work, several of which (`use-persistent-volume.ts`'s module-level cache, `use-hls-player.ts`'s unexported pure helpers) have their own gotchas worth a dedicated pass.

## Verification

- `npm test` runs all new suites headless and exits 0.
- `npm run test:watch` for iterating.
- `npx tsc --noEmit` still passes (new test files type-check under the existing `tsconfig.json`, no edits needed there).
- `npm run lint` still passes.
- Confirm no `data/app.db` mutation from a test run (`git status` on `data/` before/after `npm test`).
