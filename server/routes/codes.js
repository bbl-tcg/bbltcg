import express from "express";
import * as db from "../db/index.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { allCards } from "../../shared/engine/cardDb.js";

export const codesRouter = express.Router();
codesRouter.use(requireAuth);

const STARTER_TYPES = new Set(["Player", "StarPlayer", "AssistantCoach"]);
const EXCLUDED_RARITIES = new Set(["Alternative Art", "Secret Rare"]);

codesRouter.post("/redeem", async (req, res) => {
  const code = (req.body?.code || "").trim().toUpperCase();
  if (!code) return res.status(400).json({ error: "Enter a code." });
  const user = await db.getUserById(req.session.userId);

  let message;
  if (code === "STARTERDECKSALLOFEM") {
    if (await db.hasRedeemedCode(user.id, code)) return res.status(400).json({ error: "You've already redeemed this code." });
    const cardIds = allCards()
      .filter((c) => STARTER_TYPES.has(c.type) && !EXCLUDED_RARITIES.has(c.rarity))
      .flatMap((c) => Array(5).fill(c.id));
    await db.addToCollection(user.id, cardIds);
    await db.recordCodeRedemption(user.id, code);
    message = "Added 5x of every Player, Star Player, and Assistant Coach card to your collection!";
  } else if (code === "WELCOME") {
    if (await db.hasRedeemedCode(user.id, code)) return res.status(400).json({ error: "You've already redeemed this code." });
    await db.addPackPoints(user.id, 75);
    await db.recordCodeRedemption(user.id, code);
    message = "+75 Pack Points!";
  } else if (code === "ADMINTEST") {
    if (user.username !== "EXDF" && user.username !== "test") return res.status(400).json({ error: "That code isn't valid for your account." });
    await db.addPackPoints(user.id, 99);
    message = "+99 Pack Points!";
  } else {
    return res.status(400).json({ error: "That code isn't valid." });
  }

  const fresh = await db.getUserById(user.id);
  res.json({ ok: true, message, packPoints: fresh.packPoints });
});
