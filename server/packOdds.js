import { allCards } from "../shared/engine/cardDb.js";

const RARITY_WEIGHTS = [
  { rarity: "Rare", weight: 91.95 },
  { rarity: "Alternative Art", weight: 8 },
  { rarity: "Secret Rare", weight: 0.05 },
];

function cardsByRarity() {
  const byRarity = {};
  for (const card of allCards()) {
    (byRarity[card.rarity] ||= []).push(card);
  }
  return byRarity;
}

function pickUniform(list, rng = Math.random) {
  return list[Math.floor(rng() * list.length)];
}

function pickWeightedRarity(rng = Math.random) {
  const total = RARITY_WEIGHTS.reduce((s, w) => s + w.weight, 0);
  let roll = rng() * total;
  for (const w of RARITY_WEIGHTS) {
    if (roll < w.weight) return w.rarity;
    roll -= w.weight;
  }
  return RARITY_WEIGHTS[RARITY_WEIGHTS.length - 1].rarity;
}

/**
 * 8 cards per pack: the first 7 slots are always Common (uniform among all Common cards),
 * the 8th slot rolls Rare (91.95%) / Alternative Art (8%) / Secret Rare (0.05%), uniform
 * within whichever rarity is rolled. Each slot is an independent draw, so duplicates within
 * a pack can happen but aren't forced.
 */
export function openPack(rng = Math.random) {
  const byRarity = cardsByRarity();
  const cardIds = [];
  for (let i = 0; i < 7; i++) {
    cardIds.push(pickUniform(byRarity["Common"], rng).id);
  }
  const rarity = pickWeightedRarity(rng);
  cardIds.push(pickUniform(byRarity[rarity], rng).id);
  return cardIds;
}
