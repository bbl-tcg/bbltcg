import express from "express";
import * as db from "../db/index.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { openPack } from "../packOdds.js";

export const packsRouter = express.Router();
packsRouter.use(requireAuth);

const PACK_COST = 3;

packsRouter.post("/open", async (req, res) => {
  const user = await db.getUserById(req.session.userId);
  if (user.packPoints < PACK_COST) return res.status(400).json({ error: `Not enough Pack Points (costs ${PACK_COST}).` });

  const cardIds = openPack();
  await db.addToCollection(user.id, cardIds);
  await db.addPackPoints(user.id, -PACK_COST);
  const fresh = await db.getUserById(user.id);
  res.json({ cardIds, packPoints: fresh.packPoints });
});

/**
 * Single-player games run entirely client-side (no server-authoritative state to hook a
 * win/loss into), so the client self-reports the outcome here to collect the +2 (loss) /
 * +4 (win) Pack Points. Trusting the client is an accepted tradeoff for a casual,
 * non-competitive economy; multiplayer results are instead awarded directly server-side
 * by the authoritative game room (see server/multiplayer.js), which doesn't have this gap.
 */
packsRouter.post("/report-result", async (req, res) => {
  const { result } = req.body || {};
  if (result !== "win" && result !== "loss") return res.status(400).json({ error: "result must be 'win' or 'loss'." });
  const gained = result === "win" ? 4 : 2;
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
