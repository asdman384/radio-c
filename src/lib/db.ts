import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * SQLite access for the app, built on Node 24's built-in `node:sqlite`.
 * No native modules, no build step, no database server to run.
 *
 * The API is synchronous by design. That is fine for a local prototype -- the
 * database is a file on the same disk and queries return in microseconds. If a
 * query ever gets slow enough to block the event loop, that is the signal to
 * move it off the request path, not to reach for an async driver.
 */

/** Values SQLite can bind to a parameter placeholder. */
export type Param = null | number | bigint | string | Uint8Array;

// turbopackIgnore stops the bundler from tracing the whole project into the
// server output just because this path is not statically known.
const DB_PATH = process.env.DATABASE_PATH
  ? path.resolve(/* turbopackIgnore: true */ process.cwd(), process.env.DATABASE_PATH)
  : path.join(process.cwd(), "data", "app.db");

const MIGRATIONS_DIR = path.join(process.cwd(), "db", "migrations");

/**
 * Applies any migration files that have not been applied yet, in filename
 * order, each in its own transaction. Returns the names it ran.
 */
export function migrate(database: DatabaseSync): string[] {
  database.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name       TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `);

  const applied = new Set(
    database
      .prepare("SELECT name FROM _migrations")
      .all()
      .map((row) => row.name as string),
  );

  const pending = existsSync(MIGRATIONS_DIR)
    ? readdirSync(MIGRATIONS_DIR)
        .filter((file) => file.endsWith(".sql"))
        .sort()
        .filter((file) => !applied.has(file))
    : [];

  for (const file of pending) {
    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    database.exec("BEGIN");
    try {
      database.exec(sql);
      database.prepare("INSERT INTO _migrations (name) VALUES (?)").run(file);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw new Error(`Migration ${file} failed: ${(error as Error).message}`, {
        cause: error,
      });
    }
  }

  return pending;
}

function openDatabase(): DatabaseSync {
  mkdirSync(path.dirname(DB_PATH), { recursive: true });

  const database = new DatabaseSync(DB_PATH);

  // WAL lets readers and writers coexist instead of locking each other out,
  // which matters once the dev server and a CLI script are both connected.
  database.exec("PRAGMA journal_mode = WAL");
  database.exec("PRAGMA foreign_keys = ON");
  database.exec("PRAGMA busy_timeout = 5000");

  const applied = migrate(database);
  if (applied.length > 0) {
    console.log(`[db] applied ${applied.length} migration(s): ${applied.join(", ")}`);
  }

  return database;
}

// Next's dev server re-evaluates modules on every edit. Without this cache each
// hot reload would open a new connection and leak the old one until restart.
const globalForDb = globalThis as unknown as { __appDb?: DatabaseSync };

export const db: DatabaseSync = (globalForDb.__appDb ??= openDatabase());

export const databasePath = DB_PATH;

/** Runs a query and returns every row. */
export function all<T>(sql: string, ...params: Param[]): T[] {
  return db.prepare(sql).all(...params) as T[];
}

/** Runs a query and returns the first row, or undefined if there is none. */
export function get<T>(sql: string, ...params: Param[]): T | undefined {
  return db.prepare(sql).get(...params) as T | undefined;
}

/** Runs a statement that changes data. Returns changes + lastInsertRowid. */
export function run(sql: string, ...params: Param[]) {
  return db.prepare(sql).run(...params);
}

/**
 * Runs `fn` inside a transaction, rolling back if it throws.
 * SQLite has no nested transactions, so do not call this from inside itself.
 */
export function transaction<T>(fn: () => T): T {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
