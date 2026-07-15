import express from "express";
import * as db from "../db/index.js";
import { requireAuth } from "../middleware/requireAuth.js";

export const collectionRouter = express.Router();
collectionRouter.use(requireAuth);

collectionRouter.get("/", async (req, res) => {
  const collection = await db.getCollection(req.session.userId);
  res.json({ collection });
});
