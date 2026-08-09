import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { teardownFreshDb, withFreshDb } from "../support/ratings-db";

let ctx: Awaited<ReturnType<typeof withFreshDb>>;

beforeAll(async () => {
  ctx = await withFreshDb();
});

afterAll(() => {
  teardownFreshDb(ctx);
});

describe("isRatingValue", () => {
  it("accepts 1 and -1", () => {
    expect(ctx.ratings.isRatingValue(1)).toBe(true);
    expect(ctx.ratings.isRatingValue(-1)).toBe(true);
  });

  it("rejects everything else", () => {
    for (const value of [0, 2, "1", null, undefined, NaN]) {
      expect(ctx.ratings.isRatingValue(value)).toBe(false);
    }
  });
});

describe("getTotals", () => {
  it("returns zeroed totals for an untouched track", () => {
    expect(ctx.ratings.getTotals("track:untouched")).toEqual({ up: 0, down: 0 });
  });
});

describe("rate", () => {
  it("accepts a first vote and reflects it in the snapshot", () => {
    const result = ctx.ratings.rate({
      trackKey: "track:first-vote",
      listenerId: "listener:a",
      value: 1,
      artist: "Artist",
      title: "Title",
    });

    expect(result.accepted).toBe(true);
    expect(result.myRating).toBe(1);
    expect(result.up).toBe(1);
    expect(result.down).toBe(0);
  });

  it("rejects a second vote from the same listener, even with a different value", () => {
    const trackKey = "track:duplicate-vote";
    const listenerId = "listener:b";
    const first = ctx.ratings.rate({ trackKey, listenerId, value: 1, artist: "A", title: "T" });
    const second = ctx.ratings.rate({ trackKey, listenerId, value: -1, artist: "A", title: "T" });

    expect(first.accepted).toBe(true);
    expect(second.accepted).toBe(false);
    expect(second.myRating).toBe(1);
    expect(second.up).toBe(1);
    expect(second.down).toBe(0);
  });

  it("accumulates totals across distinct listeners on the same track", () => {
    const trackKey = "track:multi-listener";
    ctx.ratings.rate({ trackKey, listenerId: "listener:c", value: 1, artist: "A", title: "T" });
    ctx.ratings.rate({ trackKey, listenerId: "listener:d", value: -1, artist: "A", title: "T" });

    expect(ctx.ratings.getTotals(trackKey)).toEqual({ up: 1, down: 1 });
  });
});

describe("getSnapshot / getMyRating", () => {
  it("returns real totals with myRating null when no listener is given", () => {
    const trackKey = "track:anonymous-snapshot";
    ctx.ratings.rate({ trackKey, listenerId: "listener:e", value: 1, artist: "A", title: "T" });

    expect(ctx.ratings.getSnapshot(trackKey, null)).toEqual({ up: 1, down: 0, myRating: null });
  });

  it("returns null for a listener who has not voted on the track", () => {
    expect(ctx.ratings.getMyRating("track:anonymous-snapshot", "listener:never-voted")).toBeNull();
  });
});
