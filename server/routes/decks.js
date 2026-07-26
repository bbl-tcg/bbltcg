import express from "express";
import * as db from "../db/index.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { validateDeck } from "../../shared/engine/deckLegality.js";
import { PS_DECK_SIZE } from "../../shared/engine/constants.js";
import { starterDeckNames, buildStarterDeckList } from "../../shared/engine/cardDb.js";

export const decksRouter = express.Router();
decksRouter.use(requireAuth);

function starterDeckName(month) {
  return `${month} (Starter)`;
}

/** Ensures each of the 4 starter decks exists as a real, editable/deletable saved deck for
 * this account - lets people tweak or delete a starter the same way as anything they built
 * themselves, instead of it being a separate hardcoded option only reachable from the Play
 * screen. Runs on every list fetch (cheap, name-keyed, idempotent) rather than only at
 * signup, so it also backfills accounts that existed before this feature and self-heals if
 * someone deletes one (does NOT recreate a deliberately-deleted starter - only ones that were
 * never saved for this account in the first place, tracked by starterDecksSeeded on signup). */
async function ensureStarterDecksSeeded(userId) {
  const user = await db.getUserById(userId);
  if (user?.starterDecksSeeded) return;
  const existingNames = new Set((await db.listDecks(userId)).map((d) => d.name));
  for (const month of starterDeckNames()) {
    const name = starterDeckName(month);
    if (existingNames.has(name)) continue;
    const { headCoachId, mainDeck } = buildStarterDeckList(month);
    await db.saveDeck(userId, { name, headCoachId, mainDeck, playmatUrl: null });
  }
  await db.setStarterDecksSeeded(userId, true);
}

decksRouter.get("/", async (req, res) => {
  await ensureStarterDecksSeeded(req.session.userId);
  const decks = await db.listDecks(req.session.userId);
  res.json({ decks });
});

decksRouter.post("/", async (req, res) => {
  const { id, name, headCoachId, mainDeck, playmatUrl } = req.body || {};
  if (!name || !headCoachId || !Array.isArray(mainDeck)) return res.status(400).json({ error: "Missing deck fields." });
  // playmatUrl is a data: URL (an uploaded/cropped image, see deckbuilder.js) - large enough
  // that it's worth a sanity cap independent of the general JSON body limit, so one bad
  // upload can't silently balloon the decks table forever.
  if (playmatUrl != null && (typeof playmatUrl !== "string" || playmatUrl.length > 2_000_000)) {
    return res.status(400).json({ error: "Playmat image is too large." });
  }

  const legality = validateDeck({ headCoachId, mainDeck, psDeckCount: PS_DECK_SIZE });
  const deckId = await db.saveDeck(req.session.userId, { id, name, headCoachId, mainDeck, playmatUrl: playmatUrl ?? null });
  res.json({ id: deckId, legality });
});

decksRouter.delete("/:id", async (req, res) => {
  await db.deleteDeck(req.session.userId, Number(req.params.id));
  res.json({ ok: true });
});
