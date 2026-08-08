import { cookies } from "next/headers";
import { getSnapshot, isRatingValue, rate } from "@/lib/ratings";

const COOKIE_NAME = "rc_listener";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // one year
const MAX_KEY_LENGTH = 300;
const MAX_FIELD_LENGTH = 200;

/** Reads the listener cookie, minting one if this is a first visit. */
async function resolveListenerId(): Promise<string> {
  const store = await cookies();
  const existing = store.get(COOKIE_NAME)?.value;
  if (existing) return existing;

  const id = crypto.randomUUID();
  store.set(COOKIE_NAME, id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
    secure: process.env.NODE_ENV === "production",
  });
  return id;
}

export async function GET(request: Request) {
  const trackKey = new URL(request.url).searchParams.get("trackKey")?.trim();
  if (!trackKey || trackKey.length > MAX_KEY_LENGTH) {
    return Response.json({ error: "invalid_track_key" }, { status: 400 });
  }

  const listenerId = await resolveListenerId();
  return Response.json(getSnapshot(trackKey, listenerId));
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const { trackKey, value, artist, title } = (body ?? {}) as Record<string, unknown>;

  if (typeof trackKey !== "string" || !trackKey.trim() || trackKey.length > MAX_KEY_LENGTH) {
    return Response.json({ error: "invalid_track_key" }, { status: 400 });
  }
  if (!isRatingValue(value)) {
    return Response.json({ error: "invalid_value" }, { status: 400 });
  }

  const listenerId = await resolveListenerId();
  const { accepted, ...snapshot } = rate({
    trackKey: trackKey.trim(),
    listenerId,
    value,
    artist: typeof artist === "string" ? artist.slice(0, MAX_FIELD_LENGTH) : "",
    title: typeof title === "string" ? title.slice(0, MAX_FIELD_LENGTH) : "",
  });

  // A repeat vote is not an error the UI must recover from — it still gets the real totals.
  return Response.json(
    accepted ? snapshot : { ...snapshot, error: "already_rated" },
    { status: accepted ? 201 : 409 },
  );
}
