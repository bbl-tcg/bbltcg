import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadDocumentXml, getBody, extractTables, walkBodyBlocks } from "./docx-utils.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const ATTACH_DIR = process.argv[2] || "C:\\Users\\smith\\Downloads\\bbltcg attachments";
const SETLIST_PATH = path.join(ATTACH_DIR, "BBLTCG-001 Setlist.docx");
const STARTER_PATH = path.join(ATTACH_DIR, "BBLTCG-001 Starter Decks.docx");

const OUT_DATA_DIR = path.join(ROOT, "shared", "data");

const TRIGGER_MAP = {
  "YOUR TURN": "YOUR_TURN",
  "OPPONENT'S TURN": "OPPONENTS_TURN",
  "WHILE ATTACKING": "WHILE_ATTACKING",
  "ON OPPONENT'S ATTACK": "ON_OPPONENTS_ATTACK",
  "ON PLAY": "ON_PLAY",
  "ON KO": "ON_KO",
  SACRIFICE: "SACRIFICE",
  NONE: null,
};

const unresolvedTriggers = new Set();

function normalizeTrigger(raw) {
  if (!raw) return null;
  const key = raw.trim().toUpperCase().replace(/[‘’]/g, "'");
  if (key in TRIGGER_MAP) return TRIGGER_MAP[key];
  unresolvedTriggers.add(raw);
  return key.replace(/[^A-Z]+/g, "_").replace(/^_+|_+$/g, "");
}

function numOrNull(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function classifyType(raw) {
  const key = (raw || "").trim().toUpperCase();
  switch (key) {
    case "PLAYER":
      return "Player";
    case "STAR PLAYER":
      return "StarPlayer";
    case "HEAD COACH":
      return "HeadCoach";
    case "ASSISTANT COACH":
      return "AssistantCoach";
    case "EVENT":
      return "Event";
    default:
      throw new Error(`Unrecognized card TYPE: "${raw}"`);
  }
}

function parseCardTable(rows) {
  const fields = {};
  const months = [];
  for (const row of rows) {
    const key = (row[0] || "").trim();
    if (!key) continue;
    const value = (row[1] || "").trim();
    const upperKey = key.toUpperCase();
    fields[upperKey] = value;
    if (upperKey === "MONTH" && value) months.push(value);
  }
  return { fields, months };
}

function buildCard(fields, months) {
  const id = fields.ID;
  if (!id) throw new Error(`Card missing ID near name "${fields.NAME}"`);
  const type = classifyType(fields.TYPE);

  const base = {
    id,
    number: numOrNull(fields.NUMBER),
    name: fields.NAME || "",
    type,
    months: months.length ? months : fields.MONTH ? [fields.MONTH] : [],
    rarity: fields.RARITY || null,
    image: `assets/cards/${id}.png`,
  };

  if (type === "Player") {
    return {
      ...base,
      cost: numOrNull(fields.COST),
      health: numOrNull(fields.HEALTH),
      attack: numOrNull(fields.ATTACK),
      tier: numOrNull(fields.TIER),
      speed: fields.SPEED ? fields.SPEED.toUpperCase() : null,
      trigger: normalizeTrigger(fields.TRIGGER),
      effect: fields.EFFECT || "",
    };
  }
  if (type === "StarPlayer") {
    return {
      ...base,
      cost: numOrNull(fields.COST),
      health: numOrNull(fields.HEALTH),
      attack: numOrNull(fields.ATTACK),
      tier: numOrNull(fields.TIER),
      speed: fields.SPEED ? fields.SPEED.toUpperCase() : null,
      trigger: normalizeTrigger(fields["TRIGGER 1"] || fields.TRIGGER),
      effect: fields["EFFECT 1"] || fields.EFFECT || "",
      starPower: {
        trigger: normalizeTrigger(fields["TRIGGER 2"]),
        effect: fields["EFFECT 2"] || "",
      },
    };
  }
  if (type === "HeadCoach") {
    return {
      ...base,
      trigger: normalizeTrigger(fields.TRIGGER),
      effect: fields.EFFECT || "",
      specialty: fields.SPECIALTY || null,
    };
  }
  if (type === "AssistantCoach") {
    return {
      ...base,
      cost: numOrNull(fields.COST),
      trigger: normalizeTrigger(fields.TRIGGER),
      effect: fields.EFFECT || "",
      specialty: fields.SPECIALTY || null,
    };
  }
  // Event
  return {
    ...base,
    cost: numOrNull(fields.COST),
    trigger: normalizeTrigger(fields.TRIGGER),
    effect: fields.EFFECT || "",
  };
}

function importSetlist() {
  const doc = loadDocumentXml(SETLIST_PATH);
  const body = getBody(doc);
  const tables = extractTables(body);
  const cards = tables.map((rows) => {
    const { fields, months } = parseCardTable(rows);
    return buildCard(fields, months);
  });
  cards.sort((a, b) => a.id.localeCompare(b.id));
  return cards;
}

function importStarterDecks() {
  const doc = loadDocumentXml(STARTER_PATH);
  const body = getBody(doc);
  const blocks = walkBodyBlocks(body);

  const decks = {};
  for (const block of blocks) {
    if (block.type !== "tbl" || !block.rows.length) continue;

    // First row is a single-cell heading like "January Starter Deck", second row is the
    // "Card ID | Quantity" header, remaining rows are entries.
    const headingRow = block.rows[0];
    const heading = (headingRow[0] || "").trim();
    const m = heading.match(/^(.*?)\s+Starter Deck\s*$/i);
    if (!m) {
      console.warn(`WARNING: could not parse starter deck heading from "${heading}"`);
      continue;
    }
    const deckName = m[1].trim();

    const rows = block.rows
      .slice(1)
      .filter((r) => r.length && r[0] && r[0].toUpperCase() !== "CARD ID");
    const cards = rows.map((r) => {
      const id = (r[0] || "").trim();
      const qtyRaw = (r[1] || "").trim();
      const isHeadCoach = /\(HC\)/i.test(qtyRaw);
      const quantity = Number(qtyRaw.replace(/\(HC\)/i, "").trim());
      return { id, quantity, isHeadCoach };
    });
    decks[deckName] = cards;
  }
  return decks;
}

function main() {
  fs.mkdirSync(OUT_DATA_DIR, { recursive: true });

  const cards = importSetlist();
  const starterDecks = importStarterDecks();

  const byId = Object.fromEntries(cards.map((c) => [c.id, c]));

  // Cross-check starter decks reference valid card IDs
  for (const [deckName, entries] of Object.entries(starterDecks)) {
    for (const entry of entries) {
      if (!byId[entry.id]) {
        console.warn(`WARNING: starter deck "${deckName}" references unknown card ID ${entry.id}`);
      }
    }
  }

  const typeCounts = {};
  for (const c of cards) typeCounts[c.type] = (typeCounts[c.type] || 0) + 1;

  fs.writeFileSync(path.join(OUT_DATA_DIR, "cards.json"), JSON.stringify(cards, null, 2));
  fs.writeFileSync(path.join(OUT_DATA_DIR, "starterDecks.json"), JSON.stringify(starterDecks, null, 2));

  console.log(`Imported ${cards.length} cards:`, typeCounts);
  console.log(`Imported ${Object.keys(starterDecks).length} starter decks:`, Object.keys(starterDecks));
  if (unresolvedTriggers.size) {
    console.warn("Unrecognized trigger strings encountered (auto-normalized, please review):", [...unresolvedTriggers]);
  }
}

main();
