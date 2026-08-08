"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type Hls from "hls.js";
import type { ErrorData, Level } from "hls.js";
import { STREAM_URL } from "@/lib/stream";

/**
 * Drives an <audio> element from the Radio Calico HLS master playlist.
 *
 * The master offers two variants:
 *   fLaC       fMP4 segments, ~1408 kbps  -- lossless, needs MSE FLAC support
 *   mp4a.40.2  MPEG-TS segments, ~211 kbps -- AAC fallback, plays everywhere
 *
 * hls.js is loaded lazily on mount so it never lands in the server bundle or
 * blocks first paint.
 */

export type PlayerStatus = "idle" | "loading" | "buffering" | "playing" | "paused" | "error";

/** Which variant to pin. "auto" hands the choice to hls.js's ABR. */
export type QualityMode = "lossless" | "efficient" | "auto";

/** Playback path in use. "native" is Safari's built-in HLS, which we prefer
 *  when it can do FLAC and MSE cannot. */
export type Engine = "hlsjs" | "native" | "unsupported" | "pending";

export type Variant = {
  /** Index into hls.levels. */
  index: number;
  lossless: boolean;
  /** "FLAC" or "AAC". */
  codec: string;
  kbps: number;
};

const MAX_RECOVERY_ATTEMPTS = 4;

/** MSE can decode FLAC-in-fMP4 in Chrome, Edge and Firefox; Safari is patchy. */
function supportsLosslessViaMse(): boolean {
  if (typeof window === "undefined") return false;
  const source =
    window.MediaSource ??
    (window as unknown as { ManagedMediaSource?: typeof MediaSource }).ManagedMediaSource;
  try {
    return source?.isTypeSupported?.('audio/mp4; codecs="flac"') ?? false;
  } catch {
    return false;
  }
}

function describeLevel(level: Level, index: number): Variant {
  const codec = (level.audioCodec ?? level.attrs?.CODECS ?? "").toLowerCase();
  const lossless = codec.includes("flac") || codec.includes("alac");
  return {
    index,
    lossless,
    codec: lossless ? "FLAC" : "AAC",
    kbps: Math.round((level.bitrate ?? 0) / 1000),
  };
}

export function useHlsPlayer(audioRef: React.RefObject<HTMLAudioElement | null>) {
  const hlsRef = useRef<Hls | null>(null);
  const recoveriesRef = useRef(0);

  const [engine, setEngine] = useState<Engine>("pending");
  const [status, setStatus] = useState<PlayerStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const [preferredQuality, setQuality] = useState<QualityMode>("lossless");

  // Attach hls.js (or the native player) once, on mount.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    let cancelled = false;
    let instance: Hls | null = null;

    async function attach() {
      const { default: HlsCtor } = await import("hls.js");
      if (cancelled || !audio) return;

      const nativeHls = audio.canPlayType("application/vnd.apple.mpegurl") !== "";
      const mseLossless = supportsLosslessViaMse();

      // Prefer whichever engine can actually deliver the lossless variant.
      // Safari often plays FLAC-in-HLS natively while refusing it over MSE.
      if (!HlsCtor.isSupported() || (!mseLossless && nativeHls)) {
        if (!nativeHls) {
          setEngine("unsupported");
          setError("This browser cannot play HLS audio.");
          setStatus("error");
          return;
        }
        audio.src = STREAM_URL;
        setEngine("native");
        return;
      }

      instance = new HlsCtor({
        // Load the manifest now so the quality options render, but do not pull
        // segments until the listener actually presses play.
        autoStartLoad: false,
        enableWorker: true,
        lowLatencyMode: false,
        // Three 5s segments of headroom: enough to ride out a hiccup without
        // drifting far behind the live edge.
        liveSyncDurationCount: 3,
        maxBufferLength: 30,
        backBufferLength: 30,
      });
      hlsRef.current = instance;

      instance.on(HlsCtor.Events.MANIFEST_PARSED, (_event, data) => {
        if (cancelled) return;
        setVariants(data.levels.map(describeLevel));
      });

      instance.on(HlsCtor.Events.LEVEL_SWITCHED, (_event, data) => {
        if (!cancelled) setActiveIndex(data.level);
      });

      instance.on(HlsCtor.Events.ERROR, (_event, data: ErrorData) => {
        if (cancelled || !data.fatal || !instance) return;

        if (recoveriesRef.current >= MAX_RECOVERY_ATTEMPTS) {
          instance.destroy();
          hlsRef.current = null;
          setError("Lost the stream. Reload the page to try again.");
          setStatus("error");
          return;
        }
        recoveriesRef.current += 1;

        switch (data.type) {
          case HlsCtor.ErrorTypes.NETWORK_ERROR:
            setStatus("buffering");
            instance.startLoad();
            break;
          case HlsCtor.ErrorTypes.MEDIA_ERROR:
            setStatus("buffering");
            instance.recoverMediaError();
            break;
          default:
            instance.destroy();
            hlsRef.current = null;
            setError("Playback failed unexpectedly.");
            setStatus("error");
        }
      });

      instance.loadSource(STREAM_URL);
      instance.attachMedia(audio);
      setEngine("hlsjs");
    }

    void attach();

    return () => {
      cancelled = true;
      instance?.destroy();
      hlsRef.current = null;
    };
  }, [audioRef]);

  // Mirror the media element's own state so the UI never drifts out of sync
  // with what is actually coming out of the speakers.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onPlaying = () => {
      recoveriesRef.current = 0;
      setError(null);
      setStatus("playing");
    };
    const onWaiting = () => setStatus("buffering");
    const onPause = () => setStatus("paused");
    const onError = () => {
      setError("The audio element could not play this stream.");
      setStatus("error");
    };

    audio.addEventListener("playing", onPlaying);
    audio.addEventListener("waiting", onWaiting);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("error", onError);

    return () => {
      audio.removeEventListener("playing", onPlaying);
      audio.removeEventListener("waiting", onWaiting);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("error", onError);
    };
  }, [audioRef]);

  const hasLossless = variants.some((variant) => variant.lossless);

  // Derived rather than stored: when this browser's MSE cannot decode FLAC, a
  // request for lossless resolves to AAC so something still plays, while the
  // listener's stated preference survives in case the variant list changes.
  const quality: QualityMode =
    preferredQuality === "lossless" && variants.length > 0 && !hasLossless
      ? "efficient"
      : preferredQuality;

  // Pin the chosen variant.
  useEffect(() => {
    const hls = hlsRef.current;
    if (!hls || variants.length === 0) return;

    if (quality === "auto") {
      hls.currentLevel = -1;
      return;
    }
    const wantLossless = quality === "lossless";
    const target = variants.find((variant) => variant.lossless === wantLossless);
    if (target) hls.currentLevel = target.index;
  }, [quality, variants]);

  const play = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;

    setStatus("loading");
    setError(null);
    try {
      // -1 resumes at the live edge rather than replaying stale buffer.
      hlsRef.current?.startLoad(-1);
      await audio.play();
    } catch (cause) {
      // A rejected play() is nearly always the autoplay policy, which resolves
      // itself on the next real click.
      setError(
        cause instanceof DOMException && cause.name === "NotAllowedError"
          ? "Your browser blocked playback. Press play again."
          : "Could not start playback.",
      );
      setStatus("error");
    }
  }, [audioRef]);

  const pause = useCallback(() => {
    audioRef.current?.pause();
    // Stop pulling segments while paused; live radio has nothing to buffer for.
    hlsRef.current?.stopLoad();
  }, [audioRef]);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void play();
    else pause();
  }, [audioRef, pause, play]);

  const activeVariant = variants.find((variant) => variant.index === activeIndex);

  return {
    engine,
    status,
    error,
    variants,
    activeVariant,
    hasLossless,
    quality,
    setQuality,
    play,
    pause,
    toggle,
    isPlaying: status === "playing" || status === "buffering" || status === "loading",
  };
}
