/**
 * Database CLI.
 *
 *   npm run db:migrate            apply pending migrations
 *   npm run db:seed               load db/seed.sql
 *   npm run db:reset              drop everything, re-migrate, re-seed
 *   npm run db:query "SELECT 1"   run one-off SQL
 *
 * Run directly with Node -- v24 executes TypeScript natively, no build step.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { db, databasePath, migrate } from "../src/lib/db.ts";

function seed(): void {
  const file = path.join(process.cwd(), "db", "seed.sql");
  if (!existsSync(file)) {
    console.log("[db] no db/seed.sql found, nothing to seed");
    return;
  }
  db.exec(readFileSync(file, "utf8"));
  console.log("[db] seeded from db/seed.sql");
}

/**
 * Drops every user table instead of deleting the .db file. On Windows the file
 * is locked while the dev server holds it open, so unlinking would fail; SQLite
 * happily lets a second process drop tables over a live connection.
 */
function dropEverything(): void {
  db.exec("PRAGMA foreign_keys = OFF");

  const objects = db
    .prepare(
      "SELECT type, name FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%'",
    )
    .all() as { type: string; name: string }[];

  for (const { type, name } of objects) {
    db.exec(`DROP ${type === "view" ? "VIEW" : "TABLE"} IF EXISTS "${name}"`);
  }

  db.exec("PRAGMA foreign_keys = ON");
  console.log(`[db] dropped ${objects.length} object(s)`);
}

function query(sql: string): void {
  if (!sql) {
    console.error('Usage: npm run db:query "SELECT * FROM items"');
    process.exitCode = 1;
    return;
  }
  const statement = db.prepare(sql);
  try {
    const rows = statement.all();
    if (rows.length === 0) console.log("(no rows)");
    else console.table(rows);
  } catch {
    // .all() throws on statements that return nothing (INSERT/UPDATE/DDL).
    const result = statement.run();
    console.log(`changes: ${result.changes}, lastInsertRowid: ${result.lastInsertRowid}`);
  }
}

const command = process.argv[2] ?? "migrate";
console.log(`[db] ${databasePath}`);

switch (command) {
  case "migrate": {
    // Importing src/lib/db.ts already migrated on connect; this catches
    // anything added since and reports honestly either way.
    const applied = migrate(db);
    console.log(applied.length > 0 ? `[db] applied: ${applied.join(", ")}` : "[db] up to date");
    break;
  }
  case "seed":
    seed();
    break;
  case "reset":
    dropEverything();
    console.log(`[db] applied: ${migrate(db).join(", ")}`);
    seed();
    break;
  case "query":
    query(process.argv.slice(3).join(" "));
    break;
  default:
    console.error(`Unknown command "${command}". Use migrate | seed | reset | query`);
    process.exitCode = 1;
}

db.close();
