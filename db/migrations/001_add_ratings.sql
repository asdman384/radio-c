CREATE TABLE ratings (
  track_key   TEXT    NOT NULL,
  listener_id TEXT    NOT NULL,
  value       INTEGER NOT NULL CHECK (value IN (-1, 1)),
  artist      TEXT    NOT NULL DEFAULT '',
  title       TEXT    NOT NULL DEFAULT '',
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (track_key, listener_id)
) WITHOUT ROWID;
