# Radio Calico — System Architecture

Mermaid diagram of the current system. Paste into Notion (Notion renders ` ```mermaid ` code
blocks natively) or any Mermaid-compatible viewer.

```mermaid
flowchart TB
    subgraph Client["Browser (Client)"]
        RP["radio-player.tsx"]
        HLS["use-hls-player.ts\n(hls.js, lazy-imported)"]
        NP["use-now-playing.ts\n(polls every 10s)"]
        TR["use-track-rating.ts"]
        PV["use-persistent-volume.ts"]
        RP --> HLS
        RP --> NP
        RP --> TR
        RP --> PV
    end

    subgraph CDN["CloudFront CDN (origin, CORS: *)"]
        M3U8["/hls/live.m3u8\nFLAC (fMP4) + AAC (MPEG-TS) variants"]
        META["/metadatav2.json\ncurrent track + last 5 + source quality"]
        COVER["/cover.jpg\ncover art (replaced in place)"]
    end

    subgraph Server["Next.js App Router server (Node runtime)"]
        API["/api/ratings\nroute.ts (GET / POST)"]
        LIB["src/lib/ratings.ts\n(SQL, parameterized)"]
        DB["src/lib/db.ts\ncached DatabaseSync connection"]
        MIG["db/migrations/*.sql\nauto-applied on first connect"]
        API --> LIB --> DB
        DB -. runs on first connect .-> MIG
    end

    SQLITE[("SQLite file\ndata/app.db\nWAL mode")]

    HLS -- "HLS segments/playlist" --> M3U8
    NP -- "poll JSON" --> META
    NP -- "fetch image" --> COVER
    TR -- "GET/POST + rc_listener cookie (httpOnly)" --> API
    DB --- SQLITE

    classDef client fill:#e8f4ff,stroke:#4a90d9,color:#1a1a1a
    classDef cdn fill:#fff4e0,stroke:#d99a3f,color:#1a1a1a
    classDef server fill:#e9f7ef,stroke:#3fa96a,color:#1a1a1a
    classDef db fill:#f3e9fb,stroke:#9b59b6,color:#1a1a1a

    class RP,HLS,NP,TR,PV client
    class M3U8,META,COVER cdn
    class API,LIB,DB,MIG server
    class SQLITE db
```

## Notes

- The browser talks **directly** to the CloudFront origin for streaming and metadata — no
  server-side proxy. The only server round-trip from the client is track ratings.
- `use-hls-player.ts` picks the FLAC (fMP4) variant by default via hls.js/MSE, falling back to
  AAC where FLAC isn't supported (notably Safari); see `AGENTS.md` for why this logic is
  deliberate and shouldn't be casually changed.
- Ratings are keyed on `trackKey(track)` (`src/lib/stream.ts`) + a per-listener `rc_listener`
  httpOnly cookie, enforced as one vote per listener per song via a DB constraint
  (`ON CONFLICT ... DO NOTHING`).
- `src/lib/db.ts` caches a single `DatabaseSync` connection on `globalThis` and applies any new
  files in `db/migrations/` before the app serves its first query.

## Database schema

```mermaid
erDiagram
    ratings {
        TEXT track_key PK "artist + title + album, see trackKey()"
        TEXT listener_id PK "rc_listener cookie value (UUID)"
        INTEGER value "CHECK: -1 or 1"
        TEXT artist "denormalized, default ''"
        TEXT title "denormalized, default ''"
        TEXT created_at "default: current UTC timestamp"
    }
    _migrations {
        TEXT name PK "migration filename"
        TEXT applied_at "default: current UTC timestamp"
    }
```

- `ratings` is `WITHOUT ROWID`, with a composite primary key `(track_key, listener_id)` — this
  is what enforces "one vote per listener per song" at the DB layer, not just in application
  code. `rate()` (`src/lib/ratings.ts`) relies on this via
  `ON CONFLICT (track_key, listener_id) DO NOTHING`.
- `value` is constrained to `-1` or `1` (👎/👍) by a `CHECK` constraint.
- `artist`/`title` are denormalized onto each row (not joined from elsewhere) since there is no
  separate `tracks` table — the CDN origin is the source of truth for track metadata, and the
  DB only persists what's needed to render past ratings.
- `_migrations` is created automatically by `migrate()` (`src/lib/db.ts`) and tracks which files
  under `db/migrations/` have been applied, by filename, so migrations are idempotent across
  restarts.
- Defined in `db/migrations/001_add_ratings.sql`; schema changes are always new migration files
  (never edits to an applied one), applied automatically on first connection or via
  `npm run db:migrate`.

## Deployment (Docker)

```mermaid
flowchart LR
    subgraph Prod["docker-compose.yml (prod)"]
        PC["prod container\nstandalone Next.js server\nnon-root user"]
        VOL[("radio-data\nnamed volume")]
        PC --- VOL
    end

    subgraph Dev["docker-compose.dev.yml (dev)"]
        DC["dev container\nnext dev"]
        BIND["repo bind mount"]
        NM["node_modules / .next\nanonymous volumes"]
        DC --- BIND
        DC --- NM
    end

    Dockerfile["Dockerfile\ndeps → dev\ndeps → builder → prod"] --> PC
    Dockerfile --> DC
```
