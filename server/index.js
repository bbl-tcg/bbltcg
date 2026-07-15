import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use("/assets", express.static(path.join(ROOT, "assets")));
app.use("/shared", express.static(path.join(ROOT, "shared")));
app.use(express.static(path.join(ROOT, "public")));

app.get("/health", (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`BBLTCG server listening on http://localhost:${PORT}`);
});
