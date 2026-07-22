import express from "express";
import * as db from "../db/index.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { validateDeck } from "../../shared/engine/deckLegality.js";
import { PS_DECK_SIZE } from "../../shared/engine/constants.js";

export const decksRouter = express.Router();
decksRouter.use(requireAuth);

decksRouter.get("/", async (req, res) => {
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
