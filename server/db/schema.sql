-- Portable across SQLite (local dev) and Postgres (production/Neon) with the small
-- per-engine substitutions handled in sqlite.js/postgres.js (autoincrement syntax, etc).

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  pack_points INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS collections (
  user_id INTEGER NOT NULL REFERENCES users(id),
  card_id TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, card_id)
);

CREATE TABLE IF NOT EXISTS decks (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  head_coach_id TEXT NOT NULL,
  main_deck_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
