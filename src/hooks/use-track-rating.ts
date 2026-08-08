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
