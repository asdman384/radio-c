"use client";

import type { ReactNode } from "react";
import type { useTrackRating } from "@/hooks/use-track-rating";
import { ThumbDownIcon, ThumbUpIcon } from "./player-icons";

type TrackRatingProps = {
  trackKey: string;
  rating: ReturnType<typeof useTrackRating>;
};

export function TrackRating({ trackKey, rating }: TrackRatingProps) {
  const disabled = !trackKey || rating.loading || rating.pending;

  return (
    <div className="mt-6 flex items-center gap-3">
      <span className="text-sm text-charcoal/70">Rate this track:</span>

      <RatingButton
        label="Thumbs up"
        count={rating.up}
        selected={rating.myRating === 1}
        locked={rating.myRating !== null}
        disabled={disabled}
        onClick={() => rating.submit(1)}
      >
        <ThumbUpIcon />
      </RatingButton>

      <RatingButton
        label="Thumbs down"
        count={rating.down}
        selected={rating.myRating === -1}
        locked={rating.myRating !== null}
        disabled={disabled}
        onClick={() => rating.submit(-1)}
      >
        <ThumbDownIcon />
      </RatingButton>

      <span aria-live="polite" className="sr-only">
        {rating.up} thumbs up, {rating.down} thumbs down
      </span>
    </div>
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
