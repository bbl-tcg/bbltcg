/** Appends " (Alternative Art)"/" (Secret Rare)" to a card's name for those two rarities
 * only - Common/Rare cards are the default expectation and don't need calling out. */
export function nameWithRarity(card) {
  if (card.rarity === "Alternative Art" || card.rarity === "Secret Rare") return `${card.name} (${card.rarity})`;
  return card.name;
}
