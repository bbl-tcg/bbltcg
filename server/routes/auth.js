import express from "express";
import bcrypt from "bcryptjs";
import * as db from "../db/index.js";
import { starterDeckNames, buildStarterDeckList } from "../../shared/engine/cardDb.js";

export const authRouter = express.Router();

function starterCollectionCardIds() {
  const ids = [];
  for (const name of starterDeckNames()) {
    const { headCoachId, mainDeck } = buildStarterDeckList(name);
    ids.push(headCoachId, ...mainDeck);
  }
  return ids;
}

function publicUser(user) {
  return { id: user.id, username: user.username, packPoints: user.packPoints };
}

authRouter.post("/signup", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || typeof username !== "string" || username.length < 3 || username.length > 24) {
    return res.status(400).json({ error: "Username must be 3-24 characters." });
  }
  if (!password || typeof password !== "string" || password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters." });
  }
  const existing = await db.getUserByUsername(username);
  if (existing) return res.status(409).json({ error: "That username is already taken." });

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await db.createUser(username, passwordHash);
  await db.addPackPoints(user.id, 5); // "starts with 5 free pack points... first time"
  await db.addToCollection(user.id, starterCollectionCardIds());

  req.session.userId = user.id;
  const fresh = await db.getUserById(user.id);
  res.json({ user: publicUser(fresh) });
});

authRouter.post("/login", async (req, res) => {
  const { username, password } = req.body || {};
  const user = await db.getUserByUsername(username || "");
  if (!user) return res.status(401).json({ error: "Invalid username or password." });
  const ok = await bcrypt.compare(password || "", user.passwordHash);
  if (!ok) return res.status(401).json({ error: "Invalid username or password." });

  req.session.userId = user.id;
  res.json({ user: publicUser(user) });
});

authRouter.post("/logout", (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

authRouter.get("/me", async (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ error: "Not logged in" });
  const user = await db.getUserById(req.session.userId);
  if (!user) return res.status(401).json({ error: "Not logged in" });
  res.json({ user: publicUser(user) });
});
