import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { teardownFreshDb, withFreshDb } from "../../../support/ratings-db";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));

function fakeCookieJar(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  const sets: Array<{ name: string; value: string; options?: unknown }> = [];
  const jar = {
    get(name: string) {
      return store.has(name) ? { name, value: store.get(name)! } : undefined;
    },
    set(name: string, value: string, options?: unknown) {
      store.set(name, value);
      sets.push({ name, value, options });
    },
  };
  return { jar, sets };
}

let dbCtx: Awaited<ReturnType<typeof withFreshDb>>;
let route: typeof import("@/app/api/ratings/route");
let cookies: ReturnType<typeof vi.fn>;

beforeAll(async () => {
  dbCtx = await withFreshDb();
  route = await import("@/app/api/ratings/route");
  ({ cookies } = (await import("next/headers")) as unknown as { cookies: typeof cookies });
});

afterAll(() => {
  teardownFreshDb(dbCtx);
});

function get(url: string) {
  return route.GET(new Request(url));
}

function post(body: unknown) {
  return route.POST(
    new Request("http://localhost/api/ratings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

describe("GET /api/ratings", () => {
  it("400s on a missing trackKey", async () => {
    const response = await get("http://localhost/api/ratings");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_track_key" });
  });

  it("400s on an over-length trackKey", async () => {
    const { jar } = fakeCookieJar();
    cookies.mockResolvedValue(jar);
    const response = await get(`http://localhost/api/ratings?trackKey=${"x".repeat(301)}`);
    expect(response.status).toBe(400);
  });

  it("mints a listener cookie on a first visit and returns a zeroed snapshot", async () => {
    const { jar, sets } = fakeCookieJar();
    cookies.mockResolvedValue(jar);

    const response = await get("http://localhost/api/ratings?trackKey=track:get-fresh");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ up: 0, down: 0, myRating: null });
    expect(sets).toHaveLength(1);
    expect(sets[0]).toMatchObject({
      name: "rc_listener",
      options: expect.objectContaining({
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
      }),
    });
  });

  it("does not re-mint a cookie for a returning listener", async () => {
    const { jar, sets } = fakeCookieJar({ rc_listener: "listener:returning" });
    cookies.mockResolvedValue(jar);

    await get("http://localhost/api/ratings?trackKey=track:get-returning");

    expect(sets).toHaveLength(0);
  });
});

describe("POST /api/ratings", () => {
  it("400s on unparsable JSON", async () => {
    const { jar } = fakeCookieJar();
    cookies.mockResolvedValue(jar);
    const response = await post("{not json");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_json" });
  });

  it("400s on a missing trackKey", async () => {
    const { jar } = fakeCookieJar();
    cookies.mockResolvedValue(jar);
    const response = await post({ value: 1 });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_track_key" });
  });

  it("400s on an invalid value", async () => {
    const { jar } = fakeCookieJar();
    cookies.mockResolvedValue(jar);
    const response = await post({ trackKey: "track:bad-value", value: 0 });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_value" });
  });

  it("accepts a first vote, truncating overlong artist/title", async () => {
    const { jar } = fakeCookieJar();
    cookies.mockResolvedValue(jar);

    const response = await post({
      trackKey: "track:post-fresh",
      value: 1,
      artist: "a".repeat(250),
      title: "Title",
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toEqual({ up: 1, down: 0, myRating: 1 });
  });

  it("409s a duplicate vote from the same browser and still returns the real totals", async () => {
    const { jar } = fakeCookieJar();
    cookies.mockResolvedValue(jar);
    const trackKey = "track:post-duplicate";

    const first = await post({ trackKey, value: 1, artist: "A", title: "T" });
    expect(first.status).toBe(201);

    const second = await post({ trackKey, value: -1, artist: "A", title: "T" });
    expect(second.status).toBe(409);
    expect(await second.json()).toEqual({ up: 1, down: 0, myRating: 1, error: "already_rated" });
  });

  it("lets a second, distinct listener vote on the same track", async () => {
    const trackKey = "track:post-second-listener";

    const { jar: jarA } = fakeCookieJar();
    cookies.mockResolvedValue(jarA);
    await post({ trackKey, value: 1, artist: "A", title: "T" });

    const { jar: jarB } = fakeCookieJar();
    cookies.mockResolvedValue(jarB);
    const second = await post({ trackKey, value: -1, artist: "A", title: "T" });

    expect(second.status).toBe(201);
    expect(await second.json()).toEqual({ up: 1, down: 1, myRating: -1 });
  });
});
