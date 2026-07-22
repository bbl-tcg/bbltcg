import "../shared/engine/nodeCardDbLoader.js";
import "../shared/effects/index.js";

import express from "express";
import cookieSession from "cookie-session";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { Server as SocketIOServer } from "socket.io";

import { authRouter } from "./routes/auth.js";
import { collectionRouter } from "./routes/collection.js";
import { decksRouter } from "./routes/decks.js";
import { packsRouter } from "./routes/packs.js";
import { codesRouter } from "./routes/codes.js";
import { attachMultiplayer } from "./multiplayer.js";
import { attachTrading } from "./trading.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const app = express();
const PORT = process.env.PORT || 3000;

// Default 100kb is too small for a saved deck carrying an uploaded/cropped playmat image as
// a data: URL (see server/routes/decks.js, which separately caps that field at ~2MB) -
// raised with headroom for the base64 + JSON-escaping overhead on top of that.
app.use(express.json({ limit: "3mb" }));
app.use(
  cookieSession({
    name: "bbltcg_session",
    keys: [process.env.SESSION_SECRET || "dev-secret-change-in-production"],
    maxAge: 90 * 24 * 60 * 60 * 1000, // 90 days
  })
);

app.use("/assets", express.static(path.join(ROOT, "assets")));
app.use("/shared", express.static(path.join(ROOT, "shared")));
app.use(express.static(path.join(ROOT, "public")));

app.use("/api/auth", authRouter);
app.use("/api/collection", collectionRouter);
app.use("/api/decks", decksRouter);
app.use("/api/packs", packsRouter);
app.use("/api/codes", codesRouter);

app.get("/health", (req, res) => res.json({ ok: true }));

const httpServer = createServer(app);
const io = new SocketIOServer(httpServer);
attachMultiplayer(io);
attachTrading(io);

httpServer.listen(PORT, () => {
  console.log(`BBLTCG server listening on http://localhost:${PORT}`);
});
