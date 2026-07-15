// Browser-side loader for cardDb.js (fetch instead of fs). Call and await this once before
// using any other engine module. See shared/engine/nodeCardDbLoader.js for the Node twin.
import { initCardDb } from "/shared/engine/cardDb.js";

export async function loadCardDb() {
  const [cards, starterDecks] = await Promise.all([
    fetch("/shared/data/cards.json").then((r) => r.json()),
    fetch("/shared/data/starterDecks.json").then((r) => r.json()),
  ]);
  initCardDb(cards, starterDecks);
}
