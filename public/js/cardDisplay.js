// Tournament-exclusive cards (only obtainable via a community code - see
// PACK_EXCLUDED_CARD_IDS in server/packOdds.js) are technically "Alternative Art" rarity for
// pack-odds/filtering purposes, but that label is misleading here since they were never in a
// pack at all - label them by how they're actually obtained instead.
const PROMO_LABELS = { "101-136": "101 Promo" };

/** Appends " (Alternative Art)"/" (Secret Rare)"/a promo label to a card's name for those
 * rarities only - Common/Rare cards are the default expectation and don't need calling out. */
export function nameWithRarity(card) {
  if (PROMO_LABELS[card.id]) return `${card.name} (${PROMO_LABELS[card.id]})`;
  if (card.rarity === "Alternative Art" || card.rarity === "Secret Rare") return `${card.name} (${card.rarity})`;
  return card.name;
}
