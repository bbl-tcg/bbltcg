import { starterDeckNames, buildStarterDeckList } from "/shared/engine/cardDb.js";
import { PS_DECK_SIZE } from "/shared/engine/constants.js";
import { validateDeck } from "/shared/engine/deckLegality.js";
import { loadCustomDecks } from "./storage.js";
import { isLoggedIn, listServerDecks } from "./api.js";

/** Starter decks + the player's own saved decks (server-backed when logged in, this
 * browser's localStorage otherwise) - "use them in gameplay IN ADDITION to the sample
 * decks provided." A saved deck can be an intentionally-incomplete draft (the deckbuilder
 * allows saving those so work in progress isn't lost) - `legal` lets callers warn about or
 * refuse to start a match with one instead of silently dealing out a too-small deck.
 */
export async function allDeckOptions() {
  const starters = starterDeckNames().map((name) => ({ key: `starter:${name}`, label: `${name} (starter)`, legal: true, resolve: () => ({ ...buildStarterDeckList(name), name }) }));
  const savedDecks = isLoggedIn() ? await listServerDecks().catch(() => []) : loadCustomDecks();
  const custom = savedDecks.map((d) => {
    const legal = validateDeck({ headCoachId: d.headCoachId, mainDeck: d.mainDeck, psDeckCount: PS_DECK_SIZE }).legal;
    return {
      key: `custom:${d.name}`,
      label: `${d.name} (custom)${legal ? "" : " - INCOMPLETE"}`,
      legal,
      // mainDeck is copied (not handed out by reference) so nothing downstream can ever
      // mutate the cached/saved deck data just by touching the array it gets to play with.
      resolve: () => ({ headCoachId: d.headCoachId, mainDeck: [...d.mainDeck], psDeckCount: PS_DECK_SIZE, name: d.name, playmatUrl: d.playmatUrl ?? null }),
    };
  });
  return [...starters, ...custom];
}
