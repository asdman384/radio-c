"use client";

import type { Track } from "@/lib/stream";

type PreviousTracksProps = {
  previous: Track[];
};

export function PreviousTracks({ previous }: PreviousTracksProps) {
  return (
    <section className="bg-mint py-6">
      <div className="mx-auto w-full max-w-[1200px] px-6">
        <h2 className="font-heading text-xl font-bold text-charcoal">Previous tracks:</h2>
        <ul className="mt-4 space-y-2">
          {previous.map((track, index) => (
            <li key={`${track.artist}-${track.title}-${index}`} className="text-charcoal">
              <span className="font-semibold">{track.artist}:</span>{" "}
              <span className="italic">{track.title}</span>
            </li>
          ))}
          {previous.length === 0 && (
            <li className="text-charcoal/60 italic">Nothing played yet this session.</li>
          )}
        </ul>
      </div>
    </section>
  );
}
