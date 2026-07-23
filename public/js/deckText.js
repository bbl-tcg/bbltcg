import { getCard } from "/shared/engine/cardDb.js";

/** "1x 001-007, 5x 001-001, 5x 001-005, ..." - the Head Coach always comes first (always
 * exactly 1 copy), followed by the main deck grouped by card ID and sorted numerically. */
export function deckToText(deck) {
  const grouped = new Map();
  for (const id of deck.mainDeck) grouped.set(id, (grouped.get(id) || 0) + 1);
  const sortedIds = [...grouped.keys()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const parts = [`1x ${deck.headCoachId}`, ...sortedIds.map((id) => `${grouped.get(id)}x ${id}`)];
  return parts.join(", ");
}

/** Parses "Nx cardId" tokens separated by commas (whitespace/newlines around each token are
 * ignored). Returns { entries: [{id, count}], errors: [] } - a non-empty errors array means
 * the text couldn't be fully parsed and nothing should be imported. */
export function parseDeckText(text) {
  const errors = [];
  const entries = [];
  const tokens = text
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  if (tokens.length === 0) errors.push("Paste a decklist first.");
  for (const token of tokens) {
    const m = token.match(/^(\d+)\s*x\s*([A-Za-z0-9-]+)$/i);
    if (!m) {
      errors.push(`Couldn't read "${token}" - expected a format like "3x 001-005".`);
      continue;
    }
    entries.push({ id: m[2], count: parseInt(m[1], 10) });
  }
  return { entries, errors };
}

/**
 * Turns parsed entries into a { headCoachId, mainDeck } deck shape, checking that every
 * card ID is real, exactly 1 Head Coach entry exists (with count 1), and the player owns
 * enough copies of everything (per `ownedQty(cardId)`). Returns { deck, error } - deck is
 * null if error is set, so callers don't need to import anything that failed validation.
 */
export function entriesToDeck(entries, ownedQty) {
  let headCoachId = null;
  const mainDeck = [];
  for (const { id, count } of entries) {
    let card;
    try {
      card = getCard(id);
    } catch {
      return { deck: null, error: `Unknown card ID: ${id}` };
    }
    const owned = ownedQty(id);
    if (owned < count) {
      return { deck: null, error: `You only own ${owned} cop${owned === 1 ? "y" : "ies"} of "${card.name}" (${id}), but the decklist needs ${count}.` };
    }
    if (card.type === "HeadCoach") {
      if (headCoachId) return { deck: null, error: "A decklist can only include 1 Head Coach." };
      if (count !== 1) return { deck: null, error: `Head Coach entry ("${card.name}") must be 1x, not ${count}x.` };
      headCoachId = id;
    } else {
      for (let i = 0; i < count; i++) mainDeck.push(id);
    }
  }
  if (!headCoachId) return { deck: null, error: "The decklist must include exactly 1 Head Coach." };
  return { deck: { headCoachId, mainDeck }, error: null };
}
