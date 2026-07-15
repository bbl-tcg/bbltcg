// LocalStorage-backed persistence for the pre-account phase of the project. Once accounts
// exist (server + Postgres), this same shape of data migrates to the server; the
// deckbuilder/collection/play-setup screens are written against these functions so that
// migration only touches this one module later, not every caller.

const DECKS_KEY = "bbltcg_customDecks";
const COLLECTION_KEY = "bbltcg_collection";
const PACK_POINTS_KEY = "bbltcg_packPoints";

export function loadCustomDecks() {
  try {
    return JSON.parse(localStorage.getItem(DECKS_KEY) || "[]");
  } catch {
    return [];
  }
}

export function saveCustomDeck(deck) {
  const decks = loadCustomDecks();
  const idx = decks.findIndex((d) => d.name === deck.name);
  if (idx !== -1) decks[idx] = deck;
  else decks.push(deck);
  localStorage.setItem(DECKS_KEY, JSON.stringify(decks));
}

export function deleteCustomDeck(name) {
  const decks = loadCustomDecks().filter((d) => d.name !== name);
  localStorage.setItem(DECKS_KEY, JSON.stringify(decks));
}

/** Collection = { [cardId]: quantityOwned }. Starts empty; screens/collection.js seeds it
 * from the 4 starter decks the first time the app runs (see ensureCollectionSeeded). */
export function loadCollection() {
  try {
    return JSON.parse(localStorage.getItem(COLLECTION_KEY) || "{}");
  } catch {
    return {};
  }
}

export function saveCollection(collection) {
  localStorage.setItem(COLLECTION_KEY, JSON.stringify(collection));
}

export function addToCollection(cardIds) {
  const collection = loadCollection();
  for (const id of cardIds) collection[id] = (collection[id] || 0) + 1;
  saveCollection(collection);
  return collection;
}

export function getPackPoints() {
  return Number(localStorage.getItem(PACK_POINTS_KEY) || "0");
}

export function setPackPoints(n) {
  localStorage.setItem(PACK_POINTS_KEY, String(Math.max(0, n)));
}

export function addPackPoints(delta) {
  const next = getPackPoints() + delta;
  setPackPoints(next);
  return next;
}

const FIRST_RUN_KEY = "bbltcg_firstRunDone";
export const STARTING_PACK_POINTS = 5;

/** "The player starts with 5 free pack points when they use the program for the first time." */
export function ensureFirstRunBonus() {
  if (localStorage.getItem(FIRST_RUN_KEY)) return;
  localStorage.setItem(FIRST_RUN_KEY, "1");
  addPackPoints(STARTING_PACK_POINTS);
}
