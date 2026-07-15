// Node-side loader for cardDb.js. Import this (for its side effect) before any other
// engine module that reads card data - server code and local scripts/tests both use this;
// the browser uses public/js/loadCardDb.js (fetch) instead.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initCardDb } from "./cardDb.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "..", "data");

const cards = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "cards.json"), "utf8"));
const starterDecks = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "starterDecks.json"), "utf8"));

initCardDb(cards, starterDecks);
