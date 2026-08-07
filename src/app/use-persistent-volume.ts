"use client";

import { useSyncExternalStore } from "react";

/**
 * Volume, persisted in localStorage.
 *
 * localStorage is an external store, so it is read through useSyncExternalStore
 * rather than an effect: the server snapshot keeps SSR and the first client
 * render identical, and the stored value is picked up straight after hydration
 * without a cascading re-render.
 */

const STORAGE_KEY = "radiocalico:volume";
const DEFAULT_VOLUME = 0.8;

let cached: number | null = null;
const listeners = new Set<() => void>();

function readVolume(): number {
  // getSnapshot must be referentially stable between renders, hence the cache.
  if (cached !== null) return cached;

  const stored = window.localStorage.getItem(STORAGE_KEY);
  // Guard the null case explicitly: Number(null) is 0, which would silently
  // start every first-time listener on mute.
  const parsed = stored === null ? Number.NaN : Number(stored);
  cached = Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : DEFAULT_VOLUME;
  return cached;
}

function serverVolume(): number {
  return DEFAULT_VOLUME;
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

export function setStoredVolume(next: number): void {
  const clamped = Math.min(1, Math.max(0, next));
  cached = clamped;
  window.localStorage.setItem(STORAGE_KEY, String(clamped));
  for (const listener of listeners) listener();
}

export function usePersistentVolume(): number {
  return useSyncExternalStore(subscribe, readVolume, serverVolume);
}
