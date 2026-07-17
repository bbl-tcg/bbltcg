// Re-exports whichever backend is active. Set DATABASE_URL (a Postgres connection string,
// e.g. from Neon) to use Postgres in production; leave it unset for local dev, which uses
// Node's built-in SQLite with zero external setup.
const impl = process.env.DATABASE_URL ? await import("./postgres.js") : await import("./sqlite.js");

export const {
  createUser,
  getUserByUsername,
  getUserById,
  setPackPoints,
  addPackPoints,
  getCollection,
  addToCollection,
  removeFromCollection,
  listDecks,
  saveDeck,
  deleteDeck,
  executeTrade,
  hasRedeemedCode,
  recordCodeRedemption,
  recordPackStats,
} = impl;

export const usingPostgres = !!process.env.DATABASE_URL;
