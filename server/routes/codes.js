import express from "express";
import * as db from "../db/index.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { allCards } from "../../shared/engine/cardDb.js";

export const codesRouter = express.Router();
codesRouter.use(requireAuth);

const STARTER_TYPES = new Set(["Player", "StarPlayer", "AssistantCoach"]);
const EXCLUDED_RARITIES = new Set(["Alternative Art", "Secret Rare", "Promo Rare"]);

// TOURNAMENT101: grants the tournament-exclusive Coach Romano alt art (101-136), once per
// account like every other code here - only usernames on this list may redeem it at all,
// and more will be added as later tournaments are run.
const TOURNAMENT101_ALLOWED_USERNAMES = new Set([
  "EXDF",
  "Schmaxel",
  "EXDF_",
  "Yossito",
  "NovemberGM",
  "StevenGerrard",
  "BannedBallDude",
  "busterbomb",
  "Hetfield",
  "robes",
]);

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
  } else if (code === "!GODPACK!") {
    // Normally one-time per account, but EXDF can redeem it as many times as they want.
    if (user.username !== "EXDF") {
      if (await db.hasRedeemedCode(user.id, code)) return res.status(400).json({ error: "You've already redeemed this code." });
      await db.recordCodeRedemption(user.id, code);
    }
    await db.setGodPackPending(user.id, true);
    message = "Your next pack is a GOD PACK! 7 Rares/Alt Arts + a guaranteed Secret Rare!";
  } else if (code === "TOURNAMENT101") {
    if (!TOURNAMENT101_ALLOWED_USERNAMES.has(user.username)) return res.status(400).json({ error: "That code isn't valid for your account." });
    if (await db.hasRedeemedCode(user.id, code)) return res.status(400).json({ error: "You've already redeemed this code." });
    await db.addToCollection(user.id, ["101-136"]);
    await db.recordCodeRedemption(user.id, code);
    message = "Added the tournament-exclusive Coach Romano alt art to your collection!";
  } else if (code === "101CHAMP") {
    if (user.username !== "Schmaxel") return res.status(400).json({ error: "That code isn't valid for your account." });
    if (await db.hasRedeemedCode(user.id, code)) return res.status(400).json({ error: "You've already redeemed this code." });
    await db.addPackPoints(user.id, 175);
    await db.recordCodeRedemption(user.id, code);
    message = "+175 Pack Points!";
  } else {
    return res.status(400).json({ error: "That code isn't valid." });
  }

  const fresh = await db.getUserById(user.id);
  res.json({ ok: true, message, packPoints: fresh.packPoints, godPackPending: fresh.godPackPending });
});
