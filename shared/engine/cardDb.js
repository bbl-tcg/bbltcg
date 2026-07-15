import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "..", "data");

const cardsArray = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "cards.json"), "utf8"));
const starterDecksRaw = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "starterDecks.json"), "utf8"));

const cardsById = new Map(cardsArray.map((c) => [c.id, c]));

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
