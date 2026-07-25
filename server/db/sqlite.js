// Local-dev database: Node's built-in SQLite, zero external setup/accounts required.
// Used automatically whenever DATABASE_URL isn't set (see index.js). Same repository
// function shape as postgres.js so server code never needs to know which one is active.
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(__dirname, "..", "..", "bbltcg-dev.sqlite");

const db = new DatabaseSync(dbPath);
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
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
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    name TEXT NOT NULL,
    head_coach_id TEXT NOT NULL,
    main_deck_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS redeemed_codes (
    user_id INTEGER NOT NULL REFERENCES users(id),
    code TEXT NOT NULL,
    redeemed_at TEXT NOT NULL,
    PRIMARY KEY (user_id, code)
  );
`);

// users/decks predate these columns, so existing rows/dev DBs need a migration rather than
// just CREATE TABLE IF NOT EXISTS (which only affects brand-new tables). Ignore "duplicate
// column" so this is safe to run on every startup.
for (const [table, column, ddl] of [
  ["users", "packs_opened", "INTEGER NOT NULL DEFAULT 0"],
  ["users", "alt_arts_pulled", "INTEGER NOT NULL DEFAULT 0"],
  ["users", "secret_rares_pulled", "INTEGER NOT NULL DEFAULT 0"],
  ["users", "god_pack_pending", "INTEGER NOT NULL DEFAULT 0"],
  ["decks", "playmat_url", "TEXT"],
]) {
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  } catch (err) {
    if (!/duplicate column/i.test(err.message)) throw err;
  }
}

function rowToUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    passwordHash: row.password_hash,
    packPoints: row.pack_points,
    createdAt: row.created_at,
    packsOpened: row.packs_opened,
    altArtsPulled: row.alt_arts_pulled,
    secretRaresPulled: row.secret_rares_pulled,
    godPackPending: !!row.god_pack_pending,
  };
}

export async function createUser(username, passwordHash) {
  const stmt = db.prepare("INSERT INTO users (username, password_hash, pack_points, created_at) VALUES (?, ?, 0, ?)");
  const info = stmt.run(username, passwordHash, new Date().toISOString());
  return getUserById(Number(info.lastInsertRowid));
}

export async function getUserByUsername(username) {
  return rowToUser(db.prepare("SELECT * FROM users WHERE username = ?").get(username));
}

export async function getUserById(id) {
  return rowToUser(db.prepare("SELECT * FROM users WHERE id = ?").get(id));
}

export async function setPackPoints(userId, points) {
  db.prepare("UPDATE users SET pack_points = ? WHERE id = ?").run(Math.max(0, points), userId);
}

export async function setGodPackPending(userId, pending) {
  db.prepare("UPDATE users SET god_pack_pending = ? WHERE id = ?").run(pending ? 1 : 0, userId);
}

export async function addPackPoints(userId, delta) {
  db.prepare("UPDATE users SET pack_points = MAX(0, pack_points + ?) WHERE id = ?").run(delta, userId);
  return getUserById(userId);
}

export async function getCollection(userId) {
  const rows = db.prepare("SELECT card_id, quantity FROM collections WHERE user_id = ?").all(userId);
  return Object.fromEntries(rows.map((r) => [r.card_id, r.quantity]));
}

export async function addToCollection(userId, cardIds) {
  const upsert = db.prepare(`
    INSERT INTO collections (user_id, card_id, quantity) VALUES (?, ?, 1)
    ON CONFLICT(user_id, card_id) DO UPDATE SET quantity = quantity + 1
  `);
  for (const cardId of cardIds) upsert.run(userId, cardId);
}

/** Returns false (no-op) if the user doesn't own enough copies - callers must check. */
export async function removeFromCollection(userId, cardId, quantity = 1) {
  const row = db.prepare("SELECT quantity FROM collections WHERE user_id = ? AND card_id = ?").get(userId, cardId);
  if (!row || row.quantity < quantity) return false;
  db.prepare("UPDATE collections SET quantity = quantity - ? WHERE user_id = ? AND card_id = ?").run(quantity, userId, cardId);
  return true;
}

export async function listDecks(userId) {
  return db.prepare("SELECT * FROM decks WHERE user_id = ? ORDER BY updated_at DESC").all(userId).map(rowToDeck);
}

function rowToDeck(row) {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    headCoachId: row.head_coach_id,
    mainDeck: JSON.parse(row.main_deck_json),
    playmatUrl: row.playmat_url ?? null,
    updatedAt: row.updated_at,
  };
}

export async function saveDeck(userId, deck) {
  const now = new Date().toISOString();
  if (deck.id) {
    db.prepare("UPDATE decks SET name = ?, head_coach_id = ?, main_deck_json = ?, playmat_url = ?, updated_at = ? WHERE id = ? AND user_id = ?").run(
      deck.name,
      deck.headCoachId,
      JSON.stringify(deck.mainDeck),
      deck.playmatUrl ?? null,
      now,
      deck.id,
      userId
    );
    return deck.id;
  }
  const info = db
    .prepare("INSERT INTO decks (user_id, name, head_coach_id, main_deck_json, playmat_url, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(userId, deck.name, deck.headCoachId, JSON.stringify(deck.mainDeck), deck.playmatUrl ?? null, now);
  return Number(info.lastInsertRowid);
}

export async function deleteDeck(userId, deckId) {
  db.prepare("DELETE FROM decks WHERE id = ? AND user_id = ?").run(deckId, userId);
}

export async function hasRedeemedCode(userId, code) {
  return !!db.prepare("SELECT 1 FROM redeemed_codes WHERE user_id = ? AND code = ?").get(userId, code);
}

export async function recordCodeRedemption(userId, code) {
  db.prepare("INSERT INTO redeemed_codes (user_id, code, redeemed_at) VALUES (?, ?, ?)").run(userId, code, new Date().toISOString());
}

/** Whether ANY account has ever redeemed this code, regardless of who - for codes with a
 * fixed global redemption limit (e.g. TOURNAMENT101's single total use) rather than the
 * usual once-per-account limit. */
export async function isCodeClaimedByAnyone(code) {
  return !!db.prepare("SELECT 1 FROM redeemed_codes WHERE code = ?").get(code);
}

/** Lifetime pack-opening stats shown on the Open a Pack screen - incremented once per pack
 * opened, never reset (persists for the account's entire existence). */
export async function recordPackStats(userId, { altArts = 0, secretRares = 0 } = {}) {
  db.prepare("UPDATE users SET packs_opened = packs_opened + 1, alt_arts_pulled = alt_arts_pulled + ?, secret_rares_pulled = secret_rares_pulled + ? WHERE id = ?").run(
    altArts,
    secretRares,
    userId
  );
}

/** Removes `cardIds.length` individual card copies (one array entry per copy, duplicates
 * for multiple copies of the same card) from the user's collection and grants `reward`
 * Pack Points - the "sell 50 cards" feature on the Open a Pack screen. Atomic: throws (and
 * changes nothing) if the user doesn't actually own enough copies of everything listed. */
export async function sellCards(userId, cardIds, reward) {
  db.exec("BEGIN");
  try {
    for (const cardId of cardIds) {
      if (!(await removeFromCollection(userId, cardId, 1))) throw new Error(`You don't own enough copies of ${cardId}.`);
    }
    db.prepare("UPDATE users SET pack_points = pack_points + ? WHERE id = ?").run(reward, userId);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  return getUserById(userId);
}

/** Atomically swaps card ownership between two users - used by the trade system. Throws
 * (and changes nothing) if either side doesn't actually own what they offered. */
export async function executeTrade(userAId, userAGives, userBId, userBGives) {
  db.exec("BEGIN");
  try {
    for (const cardId of userAGives) {
      if (!(await removeFromCollection(userAId, cardId, 1))) throw new Error(`User ${userAId} does not own ${cardId}`);
    }
    for (const cardId of userBGives) {
      if (!(await removeFromCollection(userBId, cardId, 1))) throw new Error(`User ${userBId} does not own ${cardId}`);
    }
    await addToCollection(userAId, userBGives);
    await addToCollection(userBId, userAGives);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}
