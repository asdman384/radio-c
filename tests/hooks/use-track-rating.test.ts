// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTrackRating } from "@/hooks/use-track-rating";

function jsonResponse(body: unknown, init?: { status?: number; ok?: boolean }) {
  return {
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
    json: async () => body,
  } as Response;
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useTrackRating", () => {
  it("starts loading and resolves the fetched snapshot", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ up: 2, down: 1, myRating: null }));

    const { result } = renderHook(() => useTrackRating("track:a", "Artist", "Title"));

    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.up).toBe(2);
    expect(result.current.down).toBe(1);
    expect(result.current.myRating).toBeNull();
  });

  it("never leaks a stale track's snapshot into a newly switched track", async () => {
    let resolveFirst: (value: Response) => void;
    const firstFetch = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });
    vi.mocked(fetch).mockReturnValueOnce(firstFetch as unknown as Promise<Response>);

    const { result, rerender } = renderHook(
      ({ trackKey }) => useTrackRating(trackKey, "Artist", "Title"),
      { initialProps: { trackKey: "track:first" } },
    );

    vi.mocked(fetch).mockResolvedValue(jsonResponse({ up: 9, down: 9, myRating: 1 }));
    rerender({ trackKey: "track:second" });

    expect(result.current.loading).toBe(true);

    await act(async () => {
      resolveFirst!(jsonResponse({ up: 100, down: 100, myRating: -1 }));
      await Promise.resolve();
    });

    expect(result.current.loading).toBe(true);
    expect(result.current.up).toBe(0);
    expect(result.current.down).toBe(0);
  });

  it("submits a vote and updates state from the response", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ up: 0, down: 0, myRating: null }));
    const { result } = renderHook(() => useTrackRating("track:submit", "Artist", "Title"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ up: 1, down: 0, myRating: 1 }, { status: 201 }));

    await act(async () => {
      await result.current.submit(1);
    });

    expect(result.current.myRating).toBe(1);
    expect(result.current.up).toBe(1);
    expect(result.current.pending).toBe(false);

    const [, postCall] = vi.mocked(fetch).mock.calls;
    expect(postCall[0]).toBe("/api/ratings");
    expect(postCall[1]).toMatchObject({ method: "POST" });
    expect(JSON.parse((postCall[1] as RequestInit).body as string)).toEqual({
      trackKey: "track:submit",
      value: 1,
      artist: "Artist",
      title: "Title",
    });
  });

  it("treats HTTP 409 as a successful update, not an error", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ up: 0, down: 0, myRating: null }));
    const { result } = renderHook(() => useTrackRating("track:conflict", "Artist", "Title"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ up: 3, down: 2, myRating: -1, error: "already_rated" }, { ok: false, status: 409 }),
    );

    await act(async () => {
      await result.current.submit(1);
    });

    expect(result.current.myRating).toBe(-1);
    expect(result.current.up).toBe(3);
    expect(result.current.down).toBe(2);
  });

  it("does not submit again once a rating is already recorded", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ up: 0, down: 0, myRating: 1 }));
    const { result } = renderHook(() => useTrackRating("track:locked", "Artist", "Title"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const callsBefore = vi.mocked(fetch).mock.calls.length;
    await act(async () => {
      await result.current.submit(-1);
    });

    expect(vi.mocked(fetch).mock.calls.length).toBe(callsBefore);
  });

  it("leaves pending false and does not throw when the network is offline", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ up: 0, down: 0, myRating: null }));
    const { result } = renderHook(() => useTrackRating("track:offline", "Artist", "Title"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await act(async () => {
      await result.current.submit(1);
    });

    expect(result.current.pending).toBe(false);
    expect(result.current.myRating).toBeNull();
  });
});
