"use client";

import { type Engine, type QualityMode, type Variant } from "@/hooks/use-hls-player";

const QUALITY_LABELS: Record<QualityMode, string> = {
  lossless: "FLAC",
  efficient: "AAC",
  auto: "Auto",
};

type QualitySelectorProps = {
  engine: Engine;
  variants: Variant[];
  hasLossless: boolean;
  quality: QualityMode;
  setQuality: (mode: QualityMode) => void;
};

export function QualitySelector({
  engine,
  variants,
  hasLossless,
  quality,
  setQuality,
}: QualitySelectorProps) {
  if (engine !== "hlsjs" || variants.length === 0) return null;

  return (
    <>
      {/* Quality selector -- only meaningful when hls.js is driving and
          the master actually offered more than one variant. */}
      {variants.length > 1 && (
        <div className="mt-2 flex flex-wrap items-center gap-3">
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

      {!hasLossless && (
        <p className="mt-3 text-sm text-charcoal/60">
          This browser cannot decode FLAC over Media Source Extensions, so the AAC
          variant is playing instead.
        </p>
      )}
    </>
  );
}
