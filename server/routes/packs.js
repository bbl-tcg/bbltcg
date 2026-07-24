import express from "express";
import * as db from "../db/index.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { openPack, openGodPack } from "../packOdds.js";
import { getCard } from "../../shared/engine/cardDb.js";

export const packsRouter = express.Router();
packsRouter.use(requireAuth);

const PACK_COST = 3;

packsRouter.post("/open", async (req, res) => {
  const user = await db.getUserById(req.session.userId);
  if (user.packPoints < PACK_COST) return res.status(400).json({ error: `Not enough Pack Points (costs ${PACK_COST}).` });

  const isGodPack = user.godPackPending;
  const cardIds = isGodPack ? openGodPack() : openPack();
  await db.addToCollection(user.id, cardIds);
  await db.addPackPoints(user.id, -PACK_COST);
  if (isGodPack) await db.setGodPackPending(user.id, false);
  const altArts = cardIds.filter((id) => getCard(id).rarity === "Alternative Art").length;
  const secretRares = cardIds.filter((id) => getCard(id).rarity === "Secret Rare").length;
  await db.recordPackStats(user.id, { altArts, secretRares });
  const fresh = await db.getUserById(user.id);
  res.json({
    cardIds,
    isGodPack,
    packPoints: fresh.packPoints,
    packsOpened: fresh.packsOpened,
    altArtsPulled: fresh.altArtsPulled,
    secretRaresPulled: fresh.secretRaresPulled,
    godPackPending: fresh.godPackPending,
  });
});

const SELL_COUNT = 50;
const SELL_REWARD = 3;

/** Sell exactly SELL_COUNT owned cards (any rarity/kind, duplicates fine) for a flat
 * SELL_REWARD Pack Points - lets a player convert an oversized collection into something
 * spendable. `cardIds` is a flat array, one entry per copy sold (so 2 copies of the same
 * card appear twice) - the client is responsible for expanding "N of card X" into that
 * shape. Atomic via db.sellCards: nothing is removed/granted unless every listed copy is
 * actually owned. */
packsRouter.post("/sell", async (req, res) => {
  const { cardIds } = req.body || {};
  if (!Array.isArray(cardIds) || cardIds.length !== SELL_COUNT) {
    return res.status(400).json({ error: `You must sell exactly ${SELL_COUNT} cards.` });
  }
  try {
    const user = await db.sellCards(req.session.userId, cardIds, SELL_REWARD);
    res.json({ packPoints: user.packPoints });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * Single-player games run entirely client-side (no server-authoritative state to hook a
 * win/loss into), so the client self-reports the outcome here to collect the +2 (normal
 * loss) / +4 (win) / +0 (conceded) Pack Points. Trusting the client is an accepted
 * tradeoff for a casual, non-competitive economy; multiplayer results are instead awarded
 * directly server-side by the authoritative game room (see server/multiplayer.js), which
 * doesn't have this gap.
 */
packsRouter.post("/report-result", async (req, res) => {
  const { result } = req.body || {};
  if (result !== "win" && result !== "loss" && result !== "concede") return res.status(400).json({ error: "result must be 'win', 'loss', or 'concede'." });
  const gained = result === "win" ? 4 : result === "loss" ? 2 : 0;
  const user = await db.addPackPoints(req.session.userId, gained);
  res.json({ packPoints: user.packPoints });
});

const FIVE_MIN_MS = 5 * 60 * 1000;

/**
 * Client pings this periodically while the app is open. Pack Points accrue server-side
 * (never trusted from the client): +1 per 5 minutes elapsed, +1 more per 5 minutes if the
 * reported screen was the deckbuilder or a live game. `screen` is a light-touch signal, not
 * a precise per-second log - fine for a hobby-project economy.
 *
 * Chunks are capped at 1 per ping: the client pings every 30s while the app is actually
 * open, so under normal use the gap between calls is always well under FIVE_MIN_MS. A much
 * bigger gap just means the ping didn't fire while the user was away (laptop asleep, tab
 * backgrounded for hours, or the session cookie surviving days between visits) - without
 * this cap, that idle wall-clock time would get cashed in as a huge one-time point grant
 * the moment the user came back, which is exactly what was happening before this fix.
 */
packsRouter.post("/heartbeat", async (req, res) => {
  const { screen } = req.body || {};
  const now = Date.now();
  const last = req.session.lastAccrualAt || now;
  const elapsedMs = now - last;
  const chunks = Math.min(1, Math.floor(elapsedMs / FIVE_MIN_MS));

  if (chunks > 0) {
    const bonusEligible = screen === "deckbuilder" || screen === "game";
    const gained = chunks * (bonusEligible ? 2 : 1);
    await db.addPackPoints(req.session.userId, gained);
  }
  req.session.lastAccrualAt = now;

  const user = await db.getUserById(req.session.userId);
  res.json({ packPoints: user.packPoints });
});
