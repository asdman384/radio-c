import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { vi } from "vitest";

type DbModule = typeof import("@/lib/db");
type RatingsModule = typeof import("@/lib/ratings");

/**
 * db.ts caches its DatabaseSync on the real globalThis, keyed by
 * process.env.DATABASE_PATH read once at import time. Setting the env var
 * after db.ts has already loaded does nothing, so every backend test file
 * must close the previous connection, point DATABASE_PATH at a fresh temp
 * file, and force a re-import via resetModules before importing db.ts again.
 */
export async function withFreshDb(): Promise<{
  db: DbModule["db"];
  ratings: RatingsModule;
  dir: string;
}> {
  const g = globalThis as unknown as { __appDb?: { close(): void } };
  g.__appDb?.close();
  delete g.__appDb;

  const dir = mkdtempSync(path.join(os.tmpdir(), "radio-ratings-test-"));
  process.env.DATABASE_PATH = path.join(dir, "test.db");

  vi.resetModules();

  const dbModule = await import("@/lib/db");
  const ratings = await import("@/lib/ratings");
  return { db: dbModule.db, ratings, dir };
}

export function teardownFreshDb(ctx: { db: { close(): void }; dir: string }): void {
  ctx.db.close();
  rmSync(ctx.dir, { recursive: true, force: true });
  delete process.env.DATABASE_PATH;
}
