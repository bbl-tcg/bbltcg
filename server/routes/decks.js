import express from "express";
import * as db from "../db/index.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { validateDeck } from "../../shared/engine/deckLegality.js";

export const decksRouter = express.Router();
decksRouter.use(requireAuth);

decksRouter.get("/", async (req, res) => {
  const decks = await db.listDecks(req.session.userId);
  res.json({ decks });
});

decksRouter.post("/", async (req, res) => {
  const { id, name, headCoachId, mainDeck } = req.body || {};
  if (!name || !headCoachId || !Array.isArray(mainDeck)) return res.status(400).json({ error: "Missing deck fields." });

  const legality = validateDeck({ headCoachId, mainDeck, psDeckCount: 5 });
  const deckId = await db.saveDeck(req.session.userId, { id, name, headCoachId, mainDeck });
  res.json({ id: deckId, legality });
});

decksRouter.delete("/:id", async (req, res) => {
  await db.deleteDeck(req.session.userId, Number(req.params.id));
  res.json({ ok: true });
});
