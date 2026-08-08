"use client";

import { useState } from "react";
import type { NowPlaying } from "@/lib/stream";

type CoverArtProps = {
  track: NowPlaying | null;
  coverSrc: string;
};

export function CoverArt({ track, coverSrc }: CoverArtProps) {
  // Tracked by URL rather than a boolean reset in an effect, so a new cover
  // automatically gets a fresh attempt.
  const [failedCoverSrc, setFailedCoverSrc] = useState<string | null>(null);
  const coverFailed = failedCoverSrc === coverSrc;

  return (
    <div className="relative aspect-square w-full overflow-hidden bg-charcoal/5">
      {coverFailed ? (
        <div className="flex h-full w-full items-center justify-center bg-mint">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/RadioCalicoLogoTM.png"
            alt=""
            className="h-1/2 w-1/2 object-contain opacity-60"
          />
        </div>
      ) : (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          key={coverSrc}
          src={coverSrc}
          alt={track ? `Cover art for ${track.album || track.title}` : "Cover art"}
          className="h-full w-full object-cover"
          onError={() => setFailedCoverSrc(coverSrc)}
        />
      )}
    </div>
  );
}
