# Feature plan — Track ratings (👍 / 👎)

Let listeners rate the currently playing song thumbs-up or thumbs-down, show the running
totals from all listeners, and allow each listener exactly one vote per song.

This is the feature `README.md` already anticipates ("Not built yet, though the reference
layout shows it: **track rating** (the 👍/👎 control)") and the first real use of the SQLite
scaffold. `RadioCalicoLayout.png` places the control as `Rate this track: 👍 👎`, between the
source/stream quality lines and the dark player pill.

---

## 1. Decisions taken

| Question | Decision | Consequence |
| --- | --- | --- |
| Can a listener change their vote? | **No — locked after the first vote.** | `INSERT … ON CONFLICT DO NOTHING`. Second attempt returns `409`. Both buttons lock in the UI and the chosen one stays highlighted. |
| How is a listener identified (no auth exists)? | **Server-issued `httpOnly` cookie.** | Route handler mints `crypto.randomUUID()` into `rc_listener`, `sameSite=lax`, `path=/`, one year. Page JS cannot read or forge it. |
| What identifies a song? | **`trackKey(track)` from `src/lib/stream.ts`** — `` `${artist} ${title} ${album}` ``. | The origin exposes no track ID. Reusing the existing identity function keeps rating identity and cover-art identity consistent. |
| Are totals per song or per play? | **Per song.** | The same song played again tomorrow accumulates onto the same totals, and a listener who already rated it cannot rate it again. This is the plain reading of "rate each song". |

### What this does *not* claim

Cookie-based identity is dedup, not authentication. Anyone who clears cookies or opens a
private window gets a fresh vote. That is the correct ceiling for an app with no accounts —
`httpOnly` was chosen over a localStorage id precisely because it cannot be rewritten from
the page console, but it is not ballot-box security. If real vote integrity is ever needed,
it needs real accounts, not a stronger fingerprint.

---

## 2. Files

| # | File | Status | Purpose |
| --- | --- | --- | --- |
| 1 | `db/migrations/001_add_ratings.sql` | new | `ratings` table |
| 2 | `src/lib/ratings.ts` | new | all SQL for the feature |
| 3 | `src/app/api/ratings/route.ts` | new | `GET` totals, `POST` a vote, cookie issuance |
| 4 | `src/app/use-track-rating.ts` | new | client hook: fetch on track change, submit vote |
| 5 | `src/app/radio-player.tsx` | edit | render the control + two icon components |
| 6 | `README.md`, `AGENTS.md` | edit | drop the "not built yet" note, document the table |

No changes to `use-hls-player.ts`, `use-now-playing.ts`, `use-persistent-volume.ts`,
`stream.ts`, `globals.css`, or `next.config.ts`.

---

## 3. Phase 1 — Migration

`db/migrations/001_add_ratings.sql`

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

- **The composite primary key is the one-vote-per-listener guarantee.** It is enforced by
  the database, not by application logic, so a race between two concurrent `POST`s from the
  same listener cannot produce two rows.
- No secondary index. `track_key` is the leftmost column of the primary key, so
  `WHERE track_key = ?` already uses it; an extra index would be dead weight.
- `artist` / `title` are denormalised copies, purely so a future "most-loved tracks" query
  can render results without parsing the opaque `track_key`. They are not part of identity.
- Naming: `001_add_ratings.sql` is the name `README.md` already advertises.

> **Local-machine gotcha.** `db/migrations/` is empty in git, but the gitignored
> `data/app.db` on this machine still holds an `items` table and a `_migrations` row for a
> deleted `001_init.sql`. A new file named `001_init.sql` would be silently skipped as
> already applied. `001_add_ratings.sql` is a different name, so it applies cleanly. Run
> `npm run db:reset` first if you want the leftovers gone.

Apply with `npm run db:migrate` (or just import `src/lib/db.ts` — migrations run on first
connect). Verify:

```bash
npm run db:query "SELECT name, sql FROM sqlite_master WHERE name = 'ratings'"
```

---

## 4. Phase 2 — `src/lib/ratings.ts`

All SQL lives here, per `AGENTS.md`, and every value is bound.

```ts
import { get, run, transaction } from "@/lib/db";

export type RatingValue = 1 | -1;

export type RatingTotals = {
  up: number;
  down: number;
};

export type RatingSnapshot = RatingTotals & {
  /** This listener's vote, or null if they have not voted on this track. */
  myRating: RatingValue | null;
};

/** True when `value` is a well-formed vote. */
export function isRatingValue(value: unknown): value is RatingValue {
  return value === 1 || value === -1;
}

export function getTotals(trackKey: string): RatingTotals {
  const row = get<{ up: number; down: number }>(
    `SELECT COALESCE(SUM(value =  1), 0) AS up,
            COALESCE(SUM(value = -1), 0) AS down
       FROM ratings
      WHERE track_key = ?`,
    trackKey,
  );
  return { up: row?.up ?? 0, down: row?.down ?? 0 };
}

export function getMyRating(trackKey: string, listenerId: string): RatingValue | null {
  const row = get<{ value: RatingValue }>(
    "SELECT value FROM ratings WHERE track_key = ? AND listener_id = ?",
    trackKey,
    listenerId,
  );
  return row?.value ?? null;
}

export function getSnapshot(trackKey: string, listenerId: string | null): RatingSnapshot {
  return {
    ...getTotals(trackKey),
    myRating: listenerId ? getMyRating(trackKey, listenerId) : null,
  };
}

/** Records a vote. `accepted` is false when this listener had already rated the track. */
export function rate(input: {
  trackKey: string;
  listenerId: string;
  value: RatingValue;
  artist: string;
  title: string;
}): RatingSnapshot & { accepted: boolean } {
  return transaction(() => {
    const result = run(
      `INSERT INTO ratings (track_key, listener_id, value, artist, title)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (track_key, listener_id) DO NOTHING`,
      input.trackKey,
      input.listenerId,
      input.value,
      input.artist,
      input.title,
    );
    return {
      ...getSnapshot(input.trackKey, input.listenerId),
      accepted: result.changes > 0,
    };
  });
}
```

Notes:

- `SUM(value = 1)` relies on SQLite returning `1`/`0` for a comparison; `SUM` over zero rows
  is `NULL`, hence the `COALESCE`. One scan produces both counts.
- The insert and the two reads run inside `transaction()` so the returned totals are the
  ones that include this vote.
- `run()` returns `changes` typed `number | bigint`; `> 0` is correct for both.
- Helpers take variadic params (`get(sql, a, b)`), not an array — matching `src/lib/db.ts`.

---

## 5. Phase 3 — `src/app/api/ratings/route.ts`

Default Node runtime. **Never add `export const runtime = "edge"`** — `node:sqlite` does not
exist there. Route handlers are uncached by default in Next 16 and Cache Components is not
enabled in `next.config.ts`, so no cache opt-out is needed on the server; the client still
sends `cache: "no-store"` to bypass the browser's own cache.

```ts
import { cookies } from "next/headers";
import { getSnapshot, isRatingValue, rate } from "@/lib/ratings";

const COOKIE_NAME = "rc_listener";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // one year
const MAX_KEY_LENGTH = 300;
const MAX_FIELD_LENGTH = 200;

/** Reads the listener cookie, minting one if this is a first visit. */
async function resolveListenerId(): Promise<string> {
  const store = await cookies();
  const existing = store.get(COOKIE_NAME)?.value;
  if (existing) return existing;

  const id = crypto.randomUUID();
  store.set(COOKIE_NAME, id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
    secure: process.env.NODE_ENV === "production",
  });
  return id;
}

export async function GET(request: Request) {
  const trackKey = new URL(request.url).searchParams.get("trackKey")?.trim();
  if (!trackKey || trackKey.length > MAX_KEY_LENGTH) {
    return Response.json({ error: "invalid_track_key" }, { status: 400 });
  }

  const listenerId = await resolveListenerId();
  return Response.json(getSnapshot(trackKey, listenerId));
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const { trackKey, value, artist, title } = (body ?? {}) as Record<string, unknown>;

  if (typeof trackKey !== "string" || !trackKey.trim() || trackKey.length > MAX_KEY_LENGTH) {
    return Response.json({ error: "invalid_track_key" }, { status: 400 });
  }
  if (!isRatingValue(value)) {
    return Response.json({ error: "invalid_value" }, { status: 400 });
  }

  const listenerId = await resolveListenerId();
  const { accepted, ...snapshot } = rate({
    trackKey: trackKey.trim(),
    listenerId,
    value,
    artist: typeof artist === "string" ? artist.slice(0, MAX_FIELD_LENGTH) : "",
    title: typeof title === "string" ? title.slice(0, MAX_FIELD_LENGTH) : "",
  });

  // A repeat vote is not an error the UI must recover from — it still gets the real totals.
  return Response.json(
    accepted ? snapshot : { ...snapshot, error: "already_rated" },
    { status: accepted ? 201 : 409 },
  );
}
```

### Contract

```
GET /api/ratings?trackKey=Fatboy%20Slim%20Weapon%20Of%20Choice%20The%20Greatest%20Hits
  200 { "up": 13, "down": 2, "myRating": null }

POST /api/ratings   { "trackKey": "…", "value": 1, "artist": "…", "title": "…" }
  201 { "up": 14, "down": 2, "myRating": 1 }

POST /api/ratings   (same listener, same track, again)
  409 { "up": 14, "down": 2, "myRating": 1, "error": "already_rated" }

  400 { "error": "invalid_track_key" | "invalid_value" | "invalid_json" }
```

Deliberate choices:

- **The 409 body carries the authoritative snapshot**, so a client that raced itself or came
  back on a second device still lands on correct state instead of having to re-`GET`.
- **`artist`/`title` come from the client and are untrusted.** They are display-only
  denormalised copies, never used for identity or lookup, and are length-capped. The worst
  a forged value does is mislabel a row in a future admin query. Deriving them server-side
  would mean the server polling the origin metadata itself — not worth it for this.
- **A `GET` can set the cookie.** That means the id exists before the listener ever votes.
  Two `GET`s racing on a cold browser can each mint an id and the last `Set-Cookie` wins;
  harmless, since neither has votes attached yet.
- No rate limiting. The primary key already caps a listener at one row per song, so the
  only abuse left is cookie-clearing, which rate limiting by IP would not fix either.

---

## 6. Phase 4 — `src/app/use-track-rating.ts`

```ts
"use client";

import { useCallback, useEffect, useState } from "react";
import type { RatingValue } from "@/lib/ratings";

type Snapshot = {
  key: string;
  up: number;
  down: number;
  myRating: RatingValue | null;
};

export function useTrackRating(trackKey: string, artist: string, title: string) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!trackKey) return;
    const controller = new AbortController();

    fetch(`/api/ratings?trackKey=${encodeURIComponent(trackKey)}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (data) setSnapshot({ key: trackKey, ...data });
      })
      .catch(() => {
        // A failed count fetch leaves the control in its loading state; nothing to recover.
      });

    return () => controller.abort();
  }, [trackKey]);

  // Derived during render: a snapshot belonging to the previous track never leaks into the
  // new one, so the track change needs no setState in an effect body.
  const current = snapshot?.key === trackKey ? snapshot : null;

  const submit = useCallback(
    async (value: RatingValue) => {
      if (!trackKey || pending || current?.myRating != null) return;
      setPending(true);
      try {
        const response = await fetch("/api/ratings", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ trackKey, value, artist, title }),
        });
        // 409 means someone already voted from this browser — its body is still authoritative.
        if (response.ok || response.status === 409) {
          setSnapshot({ key: trackKey, ...(await response.json()) });
        }
      } catch {
        // Offline or origin down; the listener can press again.
      } finally {
        setPending(false);
      }
    },
    [trackKey, pending, current?.myRating, artist, title],
  );

  return {
    up: current?.up ?? 0,
    down: current?.down ?? 0,
    myRating: current?.myRating ?? null,
    /** Counts for this track have not arrived yet. */
    loading: current === null,
    pending,
    submit,
  };
}
```

### The lint trap, handled

`react-hooks/set-state-in-effect` is enforced and fails `npm run lint`. Two things keep this
hook clean:

- The only `setState` inside the effect is in an **async `.then` callback**, not the
  synchronous effect body — that is not what the rule forbids.
- Resetting on track change is done by **deriving during render** (`snapshot?.key ===
  trackKey`) rather than clearing state in an effect. This also removes a flash of the
  previous song's counts, which a reset-in-effect would show for one frame.

Counts refresh when the track changes and immediately after voting. No polling: totals for a
song already playing move slowly, and the metadata poll every 10 s already drives a natural
refresh at each track boundary. If live-ticking counts are ever wanted, add a 10 s interval
to the same effect — but that doubles request volume for little gain.

---

## 7. Phase 5 — `src/app/radio-player.tsx`

Read `trackKey` from the existing metadata hook and derive it during render:

```tsx
import { trackKey } from "@/lib/stream";
import { useTrackRating } from "./use-track-rating";

const { track, stale, coverSrc } = useNowPlaying();
const key = trackKey(track);
const rating = useTrackRating(key, track?.artist ?? "", track?.title ?? "");
```

Insert the control **after the closing `</dl>` of the quality block and before the player
pill** (`<div className="mt-8 flex flex-wrap items-center gap-4 rounded-lg bg-[#3a3a3a] …">`),
which is where `RadioCalicoLayout.png` puts it:

```tsx
{/* Track rating */}
<div className="mt-8 flex items-center gap-3">
  <span className="text-sm text-charcoal/70">Rate this track:</span>

  <RatingButton
    label="Thumbs up"
    count={rating.up}
    selected={rating.myRating === 1}
    locked={rating.myRating !== null}
    disabled={!key || rating.loading || rating.pending}
    onClick={() => rating.submit(1)}
  >
    <ThumbUpIcon />
  </RatingButton>

  <RatingButton
    label="Thumbs down"
    count={rating.down}
    selected={rating.myRating === -1}
    locked={rating.myRating !== null}
    disabled={!key || rating.loading || rating.pending}
    onClick={() => rating.submit(-1)}
  >
    <ThumbDownIcon />
  </RatingButton>
</div>
```

`RatingButton` is a local component in the same file, alongside the existing `PlayIcon` /
`PauseIcon` / `VolumeIcon` / `MutedIcon`:

```tsx
className={`flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-sm
  font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-teal
  focus-visible:outline-none disabled:cursor-not-allowed ${
    selected
      ? "bg-forest text-white"
      : locked
        ? "bg-transparent text-charcoal/40"
        : "bg-transparent text-forest hover:bg-mint"
  }`}
```

- Brand tokens only (`forest`, `mint`, `teal`, `charcoal`) — no raw hex, per `AGENTS.md`.
- Once voted, the chosen button stays `bg-forest text-white` and the other fades to
  `text-charcoal/40`, so the state reads as "you picked this" rather than "this is broken".
  `--color-calico` (`#efa63c`, currently unused, the style guide's CTA colour) is the
  obvious alternative accent for the selected state if forest reads too quietly.
- Accessibility: `aria-pressed={selected}`, `aria-disabled` via the real `disabled`
  attribute, and `aria-label={`${label}, ${count} votes`}` so the count is announced rather
  than being a bare number next to an icon. Also add `aria-live="polite"` to a visually
  hidden span so the new totals are announced after voting.
- Two new stroke icons (`ThumbUpIcon`, `ThumbDownIcon`) matching the existing set:
  `viewBox="0 0 24 24"`, `stroke="currentColor"`, `strokeWidth={2}`, rounded caps and joins,
  `fill="none"`.
- While `rating.loading` is true the counts render as `0` and the buttons are disabled;
  before any track has loaded (`!key`) the whole control is disabled too. It is never hidden
  — a control that appears late would shift the layout.

---

## 8. Verification

The repo has **no test runner and no test files**; `npm run build`, `npx tsc --noEmit`, and
`npm run lint` are the de facto suite, and `README.md` records them as clean. Keep them that
way.

```bash
npx tsc --noEmit
npm run lint
npm run build
```

`AGENTS.md` gotcha: if a route under `src/app/api/` is ever deleted or renamed, stale entries
in `.next/types/validator.ts` break `npx tsc --noEmit` — delete `.next/` and rebuild.

Manual checks against `npm run dev`:

```bash
# cold visitor — should mint a cookie and report zeroes
curl -i -c jar.txt "http://localhost:3000/api/ratings?trackKey=test%20song%20album"

# first vote -> 201
curl -i -b jar.txt -c jar.txt -X POST http://localhost:3000/api/ratings \
  -H "content-type: application/json" \
  -d '{"trackKey":"test song album","value":1,"artist":"test","title":"song"}'

# same cookie again -> 409, counts unchanged
curl -i -b jar.txt -X POST http://localhost:3000/api/ratings \
  -H "content-type: application/json" \
  -d '{"trackKey":"test song album","value":-1,"artist":"test","title":"song"}'

# a different listener (no cookie jar) -> 201, totals now 1 up / 1 down
curl -i -X POST http://localhost:3000/api/ratings \
  -H "content-type: application/json" \
  -d '{"trackKey":"test song album","value":-1,"artist":"test","title":"song"}'

npm run db:query "SELECT track_key, value, COUNT(*) FROM ratings GROUP BY track_key, value"
```

In the browser: vote, confirm the button locks and the count increments; hard-reload and
confirm the vote is still shown (cookie persisted, `myRating` returned by `GET`); wait for a
track change and confirm the control resets to unvoted with that song's own totals.

Checklist:

- [ ] Second vote from the same browser is rejected and totals do not move
- [ ] `409` response body still carries correct totals
- [ ] A second browser profile can vote on the same song
- [ ] Vote survives a reload
- [ ] Control resets on track change without flashing the previous song's counts
- [ ] Keyboard: both buttons reachable by Tab, teal focus ring visible, Enter/Space vote
- [ ] Malformed `POST` (`value: 0`, missing `trackKey`, non-JSON body) returns `400`
- [ ] Nothing regressed in playback — press play, confirm `1408 kbps FLAC / HLS Lossless`

**Optional, out of scope unless you want it:** adding `node:test` for `src/lib/ratings.ts`
would cover the dedup guarantee without a browser. It means introducing a test runner and a
`test` script the project does not currently have, so it is a separate decision.

> `CLAUDE.md` names `planner`, `tester`, and `code-reviewer` agents. Only `Explore`, `Plan`,
> and `general-purpose` are registered in this environment, so the verification above is the
> manual substitute for the `tester` step.

---

## 9. Docs to update

- `README.md` — remove the closing "Not built yet … **track rating**" paragraph; document the
  `ratings` table, the `rc_listener` cookie, and the `/api/ratings` contract in the database
  section, replacing "`db/migrations/` is empty and there are no tables".
- `AGENTS.md` — the "Database" section says "Nothing uses SQLite yet — `db/migrations/` is
  empty." That stops being true. Note that `next dev` rewrites the top block of this file, so
  commit any regenerated content along with the change to keep the tree clean.

---

## 10. Order of work

One task at a time, per `CLAUDE.md`. Each step ends verifiable.

1. `git checkout -b ratings` (the tree is clean at `b1132db`).
2. **Migration** → `npm run db:migrate`, confirm the table with `npm run db:query`.
3. **`src/lib/ratings.ts`** → `npx tsc --noEmit`.
4. **Route handler** → the four `curl` checks above.
5. **Hook** → `npm run lint` (this is where `set-state-in-effect` would bite).
6. **UI** → browser checks, then `npm run build`.
7. **Docs.**
8. Review the diff before committing.

Rollback at any point is `git checkout -- .` plus `npm run db:reset`; the only persistent
state is the gitignored `data/app.db`.

---

## 11. Risks

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| `trackKey` collides across genuinely different recordings (same artist/title/album on a remaster) | Low | Accepted. The origin gives no ID; the same function already governs cover-art identity, so a collision is a pre-existing condition, not a new one. |
| Origin changes a metadata field, shifting every `trackKey` | Low | Old rows orphan and counts restart at zero. Not corrupting, and `artist`/`title` are stored so rows could be re-keyed. |
| `set-state-in-effect` lint failure | Medium | Designed around it in §6 — derive during render, async-only `setState`. |
| Listener clears cookies and re-votes | Certain, by design | Out of scope without accounts. Stated in §1. |
| SQLite write contention under concurrent votes | Very low | Single-process, WAL, 5 s busy timeout, and each vote is one tiny transaction. |
| Deleting/renaming the route later breaks `tsc` | Low | Documented `.next/` cleanup in §8. |
