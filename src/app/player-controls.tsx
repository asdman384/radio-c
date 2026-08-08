"use client";

import { type RefObject, useEffect, useState } from "react";
import type { Engine, PlayerStatus } from "./use-hls-player";
import { setStoredVolume, usePersistentVolume } from "./use-persistent-volume";
import { MutedIcon, PauseIcon, PlayIcon, VolumeIcon } from "./player-icons";

function formatElapsed(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

type PlayerControlsProps = {
  audioRef: RefObject<HTMLAudioElement | null>;
  engine: Engine;
  status: PlayerStatus;
  isPlaying: boolean;
  toggle: () => void;
};

export function PlayerControls({ audioRef, engine, status, isPlaying, toggle }: PlayerControlsProps) {
  const volume = usePersistentVolume();
  const [muted, setMuted] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    audio.muted = muted;
  }, [audioRef, volume, muted]);

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
  );
}
