// Isomorphic in-memory card database - no filesystem/network access here, so this module
// works unmodified in the browser (single-player, client-side engine) and on the server
// (multiplayer, authoritative engine). Something must call initCardDb() once before any
// other engine code runs: scripts/nodeCardDbLoader.js (Node, fs) or public/js/loadCardDb.js
// (browser, fetch) - see those for the two environment-specific loaders.

let cardsArray = [];
let cardsById = new Map();
let starterDecksRaw = {};

export function initCardDb(cards, starterDecks) {
  cardsArray = cards;
  cardsById = new Map(cards.map((c) => [c.id, c]));
  starterDecksRaw = starterDecks;
}

export function isCardDbInitialized() {
  return cardsArray.length > 0;
}

export function getCard(cardId) {
  const card = cardsById.get(cardId);
  if (!card) throw new Error(`Unknown card id: ${cardId}`);
  return card;
}

export function allCards() {
  return cardsArray;
}

export function findCardsByName(name) {
  return cardsArray.filter((c) => c.name === name);
}

/** Expand a starter deck definition into { headCoachId, mainDeck: string[], psDeckCount } */
export function buildStarterDeckList(deckName) {
  const entries = starterDecksRaw[deckName];
  if (!entries) throw new Error(`Unknown starter deck: ${deckName}`);
  let headCoachId = null;
  const mainDeck = [];
  for (const entry of entries) {
    if (entry.isHeadCoach) {
      headCoachId = entry.id;
    } else {
      for (let i = 0; i < entry.quantity; i++) mainDeck.push(entry.id);
    }
  }
  return { headCoachId, mainDeck, psDeckCount: 5 };
}

export function starterDeckNames() {
  return Object.keys(starterDecksRaw);
}
