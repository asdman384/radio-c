# Radio Calico

A web player for the Radio Calico lossless internet radio stream.

**Next.js 16** (App Router, TypeScript, Tailwind 4) + **hls.js** for playback, with a
**SQLite** scaffold via Node 24's built-in `node:sqlite` ready for when the site needs to
store anything. No database server, no native modules.

## Getting started

```bash
npm install
npm run dev      # http://localhost:3000
```

That is all the player needs — it talks directly to the CloudFront origin and does not
currently touch the database.

## The player

### The stream

The origin publishes a two-variant HLS master playlist at
`https://d3d4yli4hf5bmh.cloudfront.net/hls/live.m3u8`:

| Variant | Codec | Container | Bitrate | Notes |
| --- | --- | --- | --- | --- |
| `flac_hires` | `fLaC` | fMP4 (`.m4s`) | ~1408 kbps | Lossless. Plays over MSE. |
| `aac_hifi` | `mp4a.40.2` | MPEG-TS (`.ts`) | ~211 kbps | Fallback, plays everywhere. |

The lossless variant being fMP4 rather than MPEG-TS is what makes browser playback possible
at all — FLAC has no MPEG-TS mapping, so a `.ts` lossless variant could not be decoded by
Media Source Extensions.

### Engine selection

`src/app/use-hls-player.ts` picks a playback path on mount:

- **hls.js** when `MediaSource.isTypeSupported('audio/mp4; codecs="flac"')` is true
  (Chrome, Edge, Firefox). This is the path that also gives the FLAC/AAC selector, since
  variant switching needs MSE.
- **Native HLS** (`audio.src = …`) when MSE cannot do FLAC but the browser can play HLS
  directly. Safari frequently plays FLAC-in-HLS natively while refusing it over MSE, so
  this path exists to keep lossless working there rather than silently downgrading.

If neither can deliver FLAC, the player falls back to the AAC variant and says so in the UI.
The listener's stated preference is kept, not overwritten, so it takes effect again if the
variant list changes.

Other playback details worth knowing:

- Segments are not fetched until the listener presses play (`autoStartLoad: false`), so
  merely opening the page costs one manifest request rather than a rolling buffer.
- Pausing calls `stopLoad()`, and resuming calls `startLoad(-1)` to rejoin at the live edge
  instead of replaying stale buffer. This is live radio; there is nothing to catch up on.
- Fatal errors are retried — network errors via `startLoad()`, media errors via
  `recoverMediaError()` — up to four times before the player gives up and says so.

### Now playing

`src/app/use-now-playing.ts` polls `/metadatav2.json` every 10 seconds (the origin sends
`max-age=10`, so faster polling only burns requests). It supplies artist, title, album, year,
source bit depth/sample rate, and the last five tracks.

`/cover.jpg` is replaced in place at a fixed URL, so it is cache-busted with a query string
only when the track actually changes.

Both endpoints send `Access-Control-Allow-Origin: *`, which is why the browser can call them
directly and no server-side proxy exists. Note that **`cover.jpg` does not send a CORS
header** — fine for an `<img>`, but it would taint a canvas, so drawing the artwork into a
canvas would require proxying it.

### Design

The UI follows the two provided brand assets, both at the repository root:

- `RadioCalico_Style_Guide.txt` — palette, typography, component rules. The palette is
  exposed as Tailwind tokens in `src/app/globals.css` (`bg-mint`, `text-forest`, `bg-charcoal`,
  `text-teal`, …) and the fonts (Montserrat headings, Open Sans body) are wired up in
  `layout.tsx`.
- `RadioCalicoLayout.png` — the reference layout: charcoal header wordmark, square cover art
  beside the track details, dark player pill, mint "Previous tracks" strip.

This is a light-only design. The brand has no dark palette, so `globals.css` deliberately
fixes the colours rather than reacting to `prefers-color-scheme`.

## The database scaffold

- **Driver:** `node:sqlite`, built into Node 24. Synchronous, which is fine for a local file.
- **File:** `data/app.db` (gitignored). Override with `DATABASE_PATH` in `.env.local`.
- **Connection:** one cached `DatabaseSync` in `src/lib/db.ts`, stashed on `globalThis`
  because Next's dev server re-evaluates modules on every edit — without the cache each hot
  reload would leak a connection.
- **Pragmas:** WAL journaling, foreign keys on, 5s busy timeout.
- **Migrations run automatically** on first connect, so a clean checkout just works.

### Adding a schema

Add a file to `db/migrations/`, named so it sorts after the last one:

```
db/migrations/001_add_ratings.sql
```

Each file runs once, in filename order, in its own transaction, recorded in `_migrations`.
**Do not edit an already-applied migration** — add another. While the schema is still
churning, editing in place and running `npm run db:reset` is faster.

Create `db/seed.sql` for development data; write it to clear before inserting so it stays
re-runnable.

| Command | What it does |
| --- | --- |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:seed` | Load `db/seed.sql` (no-op if absent) |
| `npm run db:reset` | Drop every table, re-migrate, re-seed |
| `npm run db:query "SELECT …"` | Run one-off SQL and print a table |

`db:reset` drops tables rather than deleting the `.db` file, so it works while `npm run dev`
is running — on Windows the file is locked while the server holds it open.

There is no `sqlite3` CLI installed; `npm run db:query` covers ad-hoc inspection, or
[DB Browser for SQLite](https://sqlitebrowser.org/) opens `data/app.db` directly.

### Track ratings

Listeners can rate the current track 👍 or 👎, one vote per listener per song, from the
`ratings` table (`db/migrations/001_add_ratings.sql`):

```sql
CREATE TABLE ratings (
  track_key   TEXT    NOT NULL,
  listener_id TEXT    NOT NULL,
  value       INTEGER NOT NULL CHECK (value IN (-1, 1)),
  artist      TEXT    NOT NULL DEFAULT '',
  title       TEXT    NOT NULL DEFAULT '',
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (track_key, listener_id)
) WITHOUT ROWID;
```

- **`track_key`** is `trackKey(track)` from `src/lib/stream.ts` (`` `${artist} ${title}
  ${album}` ``) — the same identity already used for cover-art cache-busting. There is no
  origin-supplied track ID.
- **`listener_id`** comes from an `httpOnly` cookie (`rc_listener`, one year, minted by
  `src/app/api/ratings/route.ts` on first request). This deduplicates votes per browser; it
  is not authentication — clearing cookies gets a fresh vote.
- **The composite primary key is the one-vote-per-listener guarantee**, enforced by SQLite
  rather than application logic.
- **`GET /api/ratings?trackKey=…`** returns `{ up, down, myRating }` for that track and
  mints the cookie if missing.
- **`POST /api/ratings`** with `{ trackKey, value, artist, title }` (`value` is `1` or `-1`)
  records a vote: `201` with the updated snapshot on success, `409` with the same
  (unchanged) snapshot if this listener already voted, `400` on malformed input.
- `src/app/use-track-rating.ts` is the client hook; the control renders in
  `src/app/radio-player.tsx` between the quality lines and the player pill.

## Project layout

```
src/app/page.tsx                 header + player (server component)
src/app/layout.tsx               fonts, metadata
src/app/globals.css              brand tokens, volume slider styling
src/app/radio-player.tsx         player UI, track rating control
src/app/use-hls-player.ts        engine selection, variant pinning, error recovery
src/app/use-now-playing.ts       metadata polling, cover cache-busting
src/app/use-persistent-volume.ts volume persisted via useSyncExternalStore
src/app/use-track-rating.ts      rating fetch + submit
src/app/api/ratings/route.ts     rating GET/POST, listener cookie issuance
src/lib/stream.ts                stream URLs, metadata parsing and formatting
src/lib/db.ts                    connection, pragmas, migrations, query helpers
src/lib/ratings.ts               ratings SQL
db/migrations/                   schema, one .sql file per change
scripts/db.mts                   database CLI (Node runs TypeScript natively)
public/RadioCalicoLogoTM.png     logo used in the header
```

## Conventions

- **Stream and metadata configuration lives in `src/lib/stream.ts`.** No hard-coded URLs in
  components.
- **SQL belongs in `src/lib/*.ts`**, not in route handlers or components, and always through
  the bound-parameter helpers (`all`, `get`, `run`, `transaction`) — never string
  interpolation.
- **Route handlers must stay on the Node runtime** (the default). `node:sqlite` does not
  exist on the edge runtime.
- **Brand colours come from the Tailwind tokens** in `globals.css`, not raw hex in class
  names, so the style guide stays the single source of truth.
- React 19's `react-hooks/set-state-in-effect` lint rule is enforced. Derive state during
  render or use `useSyncExternalStore`; do not call `setState` synchronously in an effect.

## Status

`npm run build`, `npx tsc --noEmit`, and `npm run lint` are all clean.

End-to-end audio playback has **not** yet been confirmed in a real browser — the FLAC path in
particular depends on runtime MSE codec support that a build cannot exercise. Open
http://localhost:3000, press play, and check that the "Stream quality" line reports
`1408 kbps FLAC / HLS Lossless`.
