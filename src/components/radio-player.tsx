"use client";

import { useRef } from "react";
import { trackKey } from "@/lib/stream";
import { CoverArt } from "./cover-art";
import { PlayerControls } from "./player-controls";
import { PreviousTracks } from "./previous-tracks";
import { QualitySelector } from "./quality-selector";
import { TrackDetails } from "./track-details";
import { TrackRating } from "./track-rating";
import { useHlsPlayer } from "@/hooks/use-hls-player";
import { useNowPlaying } from "@/hooks/use-now-playing";
import { useTrackRating } from "@/hooks/use-track-rating";

export function RadioPlayer() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const {
    engine,
    status,
    error,
    variants,
    activeVariant,
    hasLossless,
    quality,
    setQuality,
    toggle,
    isPlaying,
  } = useHlsPlayer(audioRef);
  const { track, stale, coverSrc } = useNowPlaying();
  const key = trackKey(track);
  const rating = useTrackRating(key, track?.artist ?? "", track?.title ?? "");

  return (
    <>
      <audio ref={audioRef} preload="none" crossOrigin="anonymous" />

      <main className="mx-auto w-full max-w-[1200px] flex-1 px-6 py-6 md:py-10">
        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:gap-10">
          <CoverArt track={track} coverSrc={coverSrc} />

          <div className="flex flex-col">
            <TrackDetails
              track={track}
              engine={engine}
              activeVariant={activeVariant}
              error={error}
              stale={stale}
            />

            <TrackRating trackKey={key} rating={rating} />

            <PlayerControls
              audioRef={audioRef}
              engine={engine}
              status={status}
              isPlaying={isPlaying}
              toggle={toggle}
            />

            <QualitySelector
              engine={engine}
              variants={variants}
              hasLossless={hasLossless}
              quality={quality}
              setQuality={setQuality}
            />
          </div>
        </div>
      </main>

      <PreviousTracks previous={track?.previous ?? []} />
    </>
  );
}
