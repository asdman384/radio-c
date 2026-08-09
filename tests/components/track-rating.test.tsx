// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TrackRating } from "@/components/track-rating";
import type { useTrackRating } from "@/hooks/use-track-rating";

type Rating = ReturnType<typeof useTrackRating>;

function fakeRating(overrides: Partial<Rating> = {}): Rating {
  return {
    up: 0,
    down: 0,
    myRating: null,
    loading: false,
    pending: false,
    submit: vi.fn(),
    ...overrides,
  };
}

describe("TrackRating", () => {
  it("renders the vote counts in each button's accessible label", () => {
    render(<TrackRating trackKey="track:a" rating={fakeRating({ up: 3, down: 2 })} />);

    expect(screen.getByLabelText("Thumbs up, 3 votes")).toBeTruthy();
    expect(screen.getByLabelText("Thumbs down, 2 votes")).toBeTruthy();
  });

  it("marks the up button pressed and locks both buttons once the listener has voted up", () => {
    render(<TrackRating trackKey="track:a" rating={fakeRating({ myRating: 1, up: 1 })} />);

    const up = screen.getByLabelText("Thumbs up, 1 votes");
    const down = screen.getByLabelText("Thumbs down, 0 votes");

    expect(up.getAttribute("aria-pressed")).toBe("true");
    expect(down.getAttribute("aria-pressed")).toBe("false");
    expect((up as HTMLButtonElement).disabled).toBe(true);
    expect((down as HTMLButtonElement).disabled).toBe(true);
  });

  it("mirrors the locked state for a downvote", () => {
    render(<TrackRating trackKey="track:a" rating={fakeRating({ myRating: -1, down: 1 })} />);

    expect(screen.getByLabelText("Thumbs down, 1 votes").getAttribute("aria-pressed")).toBe("true");
    expect((screen.getByLabelText("Thumbs up, 0 votes") as HTMLButtonElement).disabled).toBe(true);
  });

  it("lets an unvoted, idle listener click either button", () => {
    const submit = vi.fn();
    render(<TrackRating trackKey="track:a" rating={fakeRating({ submit })} />);

    const up = screen.getByLabelText("Thumbs up, 0 votes") as HTMLButtonElement;
    const down = screen.getByLabelText("Thumbs down, 0 votes") as HTMLButtonElement;
    expect(up.disabled).toBe(false);
    expect(down.disabled).toBe(false);

    up.click();
    expect(submit).toHaveBeenCalledWith(1);

    down.click();
    expect(submit).toHaveBeenCalledWith(-1);
  });

  it("disables the buttons while loading, for a different reason than being locked", () => {
    render(<TrackRating trackKey="track:a" rating={fakeRating({ loading: true })} />);

    const up = screen.getByLabelText("Thumbs up, 0 votes") as HTMLButtonElement;
    expect(up.disabled).toBe(true);
    // Locked styling (charcoal/40) is reserved for an already-cast vote; a
    // merely-loading control keeps the normal unlocked color classes.
    expect(up.className).not.toContain("text-charcoal/40");
  });

  it("exposes the counts in the visually-hidden live region", () => {
    render(<TrackRating trackKey="track:a" rating={fakeRating({ up: 5, down: 4 })} />);

    expect(screen.getByText("5 thumbs up, 4 thumbs down")).toBeTruthy();
  });
});
