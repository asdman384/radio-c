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
