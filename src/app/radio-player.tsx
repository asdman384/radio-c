"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { formatSourceQuality, trackKey } from "@/lib/stream";
import { type QualityMode, useHlsPlayer } from "./use-hls-player";
import { useNowPlaying } from "./use-now-playing";
import { setStoredVolume, usePersistentVolume } from "./use-persistent-volume";
import { useTrackRating } from "./use-track-rating";

function formatElapsed(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

const QUALITY_LABELS: Record<QualityMode, string> = {
  lossless: "FLAC",
  efficient: "AAC",
  auto: "Auto",
};

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

  const volume = usePersistentVolume();
  const [muted, setMuted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  // Tracked by URL rather than a boolean reset in an effect, so a new cover
  // automatically gets a fresh attempt.
  const [failedCoverSrc, setFailedCoverSrc] = useState<string | null>(null);
  const coverFailed = failedCoverSrc === coverSrc;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    audio.muted = muted;
  }, [volume, muted]);

  useEffect(() => {
    if (status !== "playing") return;
    const id = setInterval(() => setElapsed((seconds) => seconds + 1), 1000);
    return () => clearInterval(id);
  }, [status]);

  function handleToggle() {
    if (audioRef.current?.paused !== false) setElapsed(0);
    toggle();
  }

  function handleVolumeChange(next: number) {
    setStoredVolume(next);
    setMuted(next === 0);
  }

  const sourceQuality = track ? formatSourceQuality(track) : null;
  const streamQuality = activeVariant
    ? `${activeVariant.kbps} kbps ${activeVariant.codec}${activeVariant.lossless ? " / HLS Lossless" : ""}`
    : engine === "native"
      ? "HLS (browser native)"
      : null;

  const statusLabel =
    status === "error"
      ? "Error"
      : status === "loading"
        ? "Connecting…"
        : status === "buffering"
          ? "Buffering…"
          : status === "playing"
            ? "Live"
            : "Live";

  return (
    <>
      <audio ref={audioRef} preload="none" crossOrigin="anonymous" />

      <main className="mx-auto w-full max-w-[1200px] flex-1 px-6 py-10 md:py-16">
        <div className="grid gap-10 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:gap-16">
          {/* Cover art */}
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

          {/* Track details */}
          <div className="flex flex-col">
            <h1 className="font-heading text-4xl leading-tight font-bold text-charcoal md:text-6xl">
              {track?.artist || "Radio Calico"}
            </h1>

            <h2 className="font-heading mt-6 text-2xl leading-snug font-bold text-charcoal md:text-3xl">
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
              <h3 className="font-heading mt-6 text-lg leading-snug font-bold text-charcoal md:text-xl">
                {track.album}
              </h3>
            )}

            <dl className="mt-8 space-y-1 text-sm text-charcoal/70 italic">
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

              <span aria-live="polite" className="sr-only">
                {rating.up} thumbs up, {rating.down} thumbs down
              </span>
            </div>

            {/* Player controls */}
            <div className="mt-8 flex flex-wrap items-center gap-4 rounded-lg bg-[#3a3a3a] px-5 py-4">
              <button
                type="button"
                onClick={handleToggle}
                disabled={engine === "unsupported"}
                aria-label={isPlaying ? "Pause" : "Play"}
                className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-white transition-colors hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-teal focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isPlaying ? <PauseIcon /> : <PlayIcon />}
              </button>

              <span className="min-w-[6.5rem] font-mono text-sm text-white tabular-nums">
                {formatElapsed(elapsed)} / {statusLabel}
              </span>

              <button
                type="button"
                onClick={() => setMuted((value) => !value)}
                aria-label={muted ? "Unmute" : "Mute"}
                className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-white transition-colors hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-teal focus-visible:outline-none"
              >
                {muted || volume === 0 ? <MutedIcon /> : <VolumeIcon />}
              </button>

              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={muted ? 0 : volume}
                onChange={(event) => handleVolumeChange(Number(event.target.value))}
                aria-label="Volume"
                className="volume-slider min-w-[8rem] flex-1 cursor-pointer"
              />
            </div>

            {/* Quality selector -- only meaningful when hls.js is driving and
                the master actually offered more than one variant. */}
            {engine === "hlsjs" && variants.length > 1 && (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <span className="text-sm text-charcoal/60">Stream:</span>
                <div className="flex overflow-hidden rounded border-2 border-forest">
                  {(Object.keys(QUALITY_LABELS) as QualityMode[]).map((mode) => {
                    const unavailable = mode === "lossless" && !hasLossless;
                    return (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setQuality(mode)}
                        disabled={unavailable}
                        aria-pressed={quality === mode}
                        className={`cursor-pointer px-4 py-1.5 text-sm font-semibold tracking-wide uppercase transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                          quality === mode
                            ? "bg-forest text-white"
                            : "bg-transparent text-forest hover:bg-mint"
                        }`}
                      >
                        {QUALITY_LABELS[mode]}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {engine === "hlsjs" && variants.length > 0 && !hasLossless && (
              <p className="mt-3 text-sm text-charcoal/60">
                This browser cannot decode FLAC over Media Source Extensions, so the AAC
                variant is playing instead.
              </p>
            )}

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
          </div>
        </div>
      </main>

      {/* Previous tracks */}
      <section className="bg-mint py-10">
        <div className="mx-auto w-full max-w-[1200px] px-6">
          <h2 className="font-heading text-xl font-bold text-charcoal">Previous tracks:</h2>
          <ul className="mt-4 space-y-2">
            {(track?.previous ?? []).map((previous, index) => (
              <li key={`${previous.artist}-${previous.title}-${index}`} className="text-charcoal">
                <span className="font-semibold">{previous.artist}:</span>{" "}
                <span className="italic">{previous.title}</span>
              </li>
            ))}
            {(track?.previous.length ?? 0) === 0 && (
              <li className="text-charcoal/60 italic">Nothing played yet this session.</li>
            )}
          </ul>
        </div>
      </section>
    </>
  );
}

type RatingButtonProps = {
  label: string;
  count: number;
  selected: boolean;
  locked: boolean;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
};

function RatingButton({
  label,
  count,
  selected,
  locked,
  disabled,
  onClick,
  children,
}: RatingButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || locked}
      aria-pressed={selected}
      aria-label={`${label}, ${count} votes`}
      className={`flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-teal focus-visible:outline-none disabled:cursor-not-allowed ${
        selected
          ? "bg-forest text-white"
          : locked
            ? "bg-transparent text-charcoal/40"
            : "bg-transparent text-forest hover:bg-mint"
      }`}
    >
      {children}
      <span>{count}</span>
    </button>
  );
}

/* Icons: 2px stroke, rounded caps, per the brand style guide. */

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true" fill="currentColor">
      <path d="M8 5.5v13a1 1 0 0 0 1.53.85l10-6.5a1 1 0 0 0 0-1.7l-10-6.5A1 1 0 0 0 8 5.5Z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true" fill="currentColor">
      <rect x="6.5" y="5" width="4" height="14" rx="1" />
      <rect x="13.5" y="5" width="4" height="14" rx="1" />
    </svg>
  );
}

function VolumeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-6 w-6"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M11 5 6.5 9H3v6h3.5L11 19V5Z" fill="currentColor" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M18.5 5.5a9 9 0 0 1 0 13" />
    </svg>
  );
}

function MutedIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-6 w-6"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M11 5 6.5 9H3v6h3.5L11 19V5Z" fill="currentColor" />
      <path d="m16 9.5 5 5M21 9.5l-5 5" />
    </svg>
  );
}

function ThumbUpIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7 22V11" />
      <path d="M7 11 10.5 3a2 2 0 0 1 2 2v4h5.5a2 2 0 0 1 1.94 2.49l-1.5 6A2 2 0 0 1 16.03 19H7" />
    </svg>
  );
}

function ThumbDownIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M17 2v11" />
      <path d="M17 13 13.5 21a2 2 0 0 1-2-2v-4H6a2 2 0 0 1-1.94-2.49l1.5-6A2 2 0 0 1 7.97 5H17" />
    </svg>
  );
}
