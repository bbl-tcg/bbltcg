const CALLOUT_RARITIES = new Set(["Alternative Art", "Secret Rare", "Promo Rare"]);

/** Appends " (Alternative Art)"/" (Secret Rare)"/" (Promo Rare)" to a card's name for those
 * rarities only - Common/Rare cards are the default expectation and don't need calling out. */
export function nameWithRarity(card) {
  if (CALLOUT_RARITIES.has(card.rarity)) return `${card.name} (${card.rarity})`;
  return card.name;
}
