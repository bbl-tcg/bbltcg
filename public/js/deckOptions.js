import { starterDeckNames, buildStarterDeckList } from "/shared/engine/cardDb.js";
import { loadCustomDecks } from "./storage.js";
import { isLoggedIn, listServerDecks } from "./api.js";

/** Starter decks + the player's own saved decks (server-backed when logged in, this
 * browser's localStorage otherwise) - "use them in gameplay IN ADDITION to the sample
 * decks provided." */
export async function allDeckOptions() {
  const starters = starterDeckNames().map((name) => ({ key: `starter:${name}`, label: `${name} (starter)`, resolve: () => ({ ...buildStarterDeckList(name), name }) }));
  const savedDecks = isLoggedIn() ? await listServerDecks().catch(() => []) : loadCustomDecks();
  const custom = savedDecks.map((d) => ({
    key: `custom:${d.name}`,
    label: `${d.name} (custom)`,
    resolve: () => ({ headCoachId: d.headCoachId, mainDeck: d.mainDeck, psDeckCount: 5, name: d.name }),
  }));
  return [...starters, ...custom];
}
