"use client";

import { formatSourceQuality, type NowPlaying } from "@/lib/stream";
import type { Engine, Variant } from "@/hooks/use-hls-player";

type TrackDetailsProps = {
  track: NowPlaying | null;
  engine: Engine;
  activeVariant: Variant | undefined;
  error: string | null;
  stale: boolean;
};

export function TrackDetails({ track, engine, activeVariant, error, stale }: TrackDetailsProps) {
  const sourceQuality = track ? formatSourceQuality(track) : null;
  const streamQuality = activeVariant
    ? `${activeVariant.kbps} kbps ${activeVariant.codec}${activeVariant.lossless ? " / HLS Lossless" : ""}`
    : engine === "native"
      ? "HLS (browser native)"
      : null;

  return (
    <>
      <h1 className="font-heading text-4xl leading-tight font-bold text-charcoal md:text-6xl">
        {track?.artist || "Radio Calico"}
      </h1>

      <h2 className="font-heading mt-4 text-2xl leading-snug font-bold text-charcoal md:text-3xl">
        {track ? (
          <>
            {track.title}
            {track.date && ` (${track.date})`}
          </>
        ) : (
          "Loading the current track…"
        )}
      </h2>

      {track?.album && (
        <h3 className="font-heading mt-3 text-lg leading-snug font-bold text-charcoal md:text-xl">
          {track.album}
        </h3>
      )}

      <dl className="mt-6 space-y-1 text-sm text-charcoal/70 italic">
        {sourceQuality && (
          <div>
            <dt className="inline">Source quality: </dt>
            <dd className="inline">{sourceQuality}</dd>
          </div>
        )}
        {streamQuality && (
          <div>
            <dt className="inline">Stream quality: </dt>
            <dd className="inline">{streamQuality}</dd>
          </div>
        )}
      </dl>

      {error && (
        <p role="alert" className="mt-4 text-sm font-semibold text-[#b3261e]">
          {error}
        </p>
      )}

      {stale && !error && (
        <p className="mt-3 text-sm text-charcoal/60">
          Track information is temporarily unavailable — audio is unaffected.
        </p>
      )}
    </>
  );
}
