// Production database (Neon Postgres, or any Postgres reachable via DATABASE_URL). Same
// repository function shape as sqlite.js. Only loaded when DATABASE_URL is set - see
// index.js - so `pg` never has to connect during local dev.
import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("localhost") ? false : { rejectUnauthorized: false },
});

await pool.query(`
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    pack_points INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS collections (
    user_id INTEGER NOT NULL REFERENCES users(id),
    card_id TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, card_id)
  );
  CREATE TABLE IF NOT EXISTS decks (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    name TEXT NOT NULL,
    head_coach_id TEXT NOT NULL,
    main_deck_json TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS redeemed_codes (
    user_id INTEGER NOT NULL REFERENCES users(id),
    code TEXT NOT NULL,
    redeemed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, code)
  );
  ALTER TABLE users ADD COLUMN IF NOT EXISTS packs_opened INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS alt_arts_pulled INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS secret_rares_pulled INTEGER NOT NULL DEFAULT 0;
`);

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
  };
}

function rowToDeck(row) {
  return { id: row.id, userId: row.user_id, name: row.name, headCoachId: row.head_coach_id, mainDeck: JSON.parse(row.main_deck_json), updatedAt: row.updated_at };
}

export async function createUser(username, passwordHash) {
  const { rows } = await pool.query("INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING *", [username, passwordHash]);
  return rowToUser(rows[0]);
}

export async function getUserByUsername(username) {
  const { rows } = await pool.query("SELECT * FROM users WHERE username = $1", [username]);
  return rowToUser(rows[0]);
}

export async function getUserById(id) {
  const { rows } = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
  return rowToUser(rows[0]);
}

export async function setPackPoints(userId, points) {
  await pool.query("UPDATE users SET pack_points = $1 WHERE id = $2", [Math.max(0, points), userId]);
}

export async function addPackPoints(userId, delta) {
  await pool.query("UPDATE users SET pack_points = GREATEST(0, pack_points + $1) WHERE id = $2", [delta, userId]);
  return getUserById(userId);
}

export async function getCollection(userId) {
  const { rows } = await pool.query("SELECT card_id, quantity FROM collections WHERE user_id = $1", [userId]);
  return Object.fromEntries(rows.map((r) => [r.card_id, r.quantity]));
}

export async function addToCollection(userId, cardIds) {
  for (const cardId of cardIds) {
    await pool.query(
      `INSERT INTO collections (user_id, card_id, quantity) VALUES ($1, $2, 1)
       ON CONFLICT (user_id, card_id) DO UPDATE SET quantity = collections.quantity + 1`,
      [userId, cardId]
    );
  }
}

export async function removeFromCollection(userId, cardId, quantity = 1) {
  const { rows } = await pool.query("SELECT quantity FROM collections WHERE user_id = $1 AND card_id = $2", [userId, cardId]);
  if (!rows[0] || rows[0].quantity < quantity) return false;
  await pool.query("UPDATE collections SET quantity = quantity - $1 WHERE user_id = $2 AND card_id = $3", [quantity, userId, cardId]);
  return true;
}

export async function listDecks(userId) {
  const { rows } = await pool.query("SELECT * FROM decks WHERE user_id = $1 ORDER BY updated_at DESC", [userId]);
  return rows.map(rowToDeck);
}

export async function saveDeck(userId, deck) {
  if (deck.id) {
    await pool.query("UPDATE decks SET name = $1, head_coach_id = $2, main_deck_json = $3, updated_at = NOW() WHERE id = $4 AND user_id = $5", [
      deck.name,
      deck.headCoachId,
      JSON.stringify(deck.mainDeck),
      deck.id,
      userId,
    ]);
    return deck.id;
  }
  const { rows } = await pool.query("INSERT INTO decks (user_id, name, head_coach_id, main_deck_json) VALUES ($1, $2, $3, $4) RETURNING id", [
    userId,
    deck.name,
    deck.headCoachId,
    JSON.stringify(deck.mainDeck),
  ]);
  return rows[0].id;
}

export async function deleteDeck(userId, deckId) {
  await pool.query("DELETE FROM decks WHERE id = $1 AND user_id = $2", [deckId, userId]);
}

export async function hasRedeemedCode(userId, code) {
  const { rows } = await pool.query("SELECT 1 FROM redeemed_codes WHERE user_id = $1 AND code = $2", [userId, code]);
  return rows.length > 0;
}

export async function recordCodeRedemption(userId, code) {
  await pool.query("INSERT INTO redeemed_codes (user_id, code) VALUES ($1, $2)", [userId, code]);
}

/** Lifetime pack-opening stats shown on the Open a Pack screen - incremented once per pack
 * opened, never reset (persists for the account's entire existence). */
export async function recordPackStats(userId, { altArts = 0, secretRares = 0 } = {}) {
  await pool.query("UPDATE users SET packs_opened = packs_opened + 1, alt_arts_pulled = alt_arts_pulled + $1, secret_rares_pulled = secret_rares_pulled + $2 WHERE id = $3", [
    altArts,
    secretRares,
    userId,
  ]);
}

export async function executeTrade(userAId, userAGives, userBId, userBGives) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const remove = async (userId, cardId) => {
      const { rows } = await client.query("SELECT quantity FROM collections WHERE user_id = $1 AND card_id = $2 FOR UPDATE", [userId, cardId]);
      if (!rows[0] || rows[0].quantity < 1) throw new Error(`User ${userId} does not own ${cardId}`);
      await client.query("UPDATE collections SET quantity = quantity - 1 WHERE user_id = $1 AND card_id = $2", [userId, cardId]);
    };
    const add = async (userId, cardId) => {
      await client.query(
        `INSERT INTO collections (user_id, card_id, quantity) VALUES ($1, $2, 1)
         ON CONFLICT (user_id, card_id) DO UPDATE SET quantity = collections.quantity + 1`,
        [userId, cardId]
      );
    };
    for (const cardId of userAGives) await remove(userAId, cardId);
    for (const cardId of userBGives) await remove(userBId, cardId);
    for (const cardId of userBGives) await add(userAId, cardId);
    for (const cardId of userAGives) await add(userBId, cardId);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
