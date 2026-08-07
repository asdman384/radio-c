"use client";

import { useEffect, useState } from "react";
import {
  COVER_URL,
  METADATA_POLL_MS,
  type NowPlaying,
  fetchNowPlaying,
  trackKey,
} from "@/lib/stream";

/**
 * Polls the origin's now-playing JSON and keeps the cover art in step.
 *
 * The poll reschedules itself only after each request settles, so a slow or
 * failing origin cannot pile up overlapping requests.
 */
export function useNowPlaying() {
  const [track, setTrack] = useState<NowPlaying | null>(null);
  const [stale, setStale] = useState(false);
  const [coverSrc, setCoverSrc] = useState(COVER_URL);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    let lastKey = "";

    async function poll() {
      try {
        const next = await fetchNowPlaying(controller.signal);
        if (stopped) return;
        setTrack(next);
        setStale(false);

        // cover.jpg is replaced in place at the same URL, so it only gets
        // re-fetched when the track actually changes.
        const key = trackKey(next);
        if (key !== lastKey) {
          lastKey = key;
          setCoverSrc(`${COVER_URL}?t=${Date.now()}`);
        }
      } catch (cause) {
        if (stopped || (cause instanceof DOMException && cause.name === "AbortError")) return;
        // Keep showing the last known track rather than blanking the page.
        setStale(true);
      } finally {
        if (!stopped) timer = setTimeout(poll, METADATA_POLL_MS);
      }
    }

    void poll();

    return () => {
      stopped = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, []);

  return { track, stale, coverSrc };
}
