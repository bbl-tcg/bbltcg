import { getCard } from "./cardDb.js";
import { CARD_TYPE, MAIN_DECK_SIZE, MAX_COPIES_PER_NAME, PS_DECK_SIZE } from "./constants.js";

/**
 * Validate a constructed deck.
 * @param {{ headCoachId: string, mainDeck: string[], psDeckCount: number }} deck
 * @returns {{ legal: boolean, errors: string[] }}
 */
export function validateDeck(deck) {
  const errors = [];

  if (!deck.headCoachId) {
    errors.push("A deck must have exactly 1 Head Coach.");
    return { legal: false, errors };
  }

  let headCoach;
  try {
    headCoach = getCard(deck.headCoachId);
  } catch {
    errors.push(`Unknown Head Coach card id: ${deck.headCoachId}`);
    return { legal: false, errors };
  }
  if (headCoach.type !== CARD_TYPE.HEAD_COACH) {
    errors.push(`${deck.headCoachId} is not a Head Coach card.`);
  }

  if (deck.mainDeck.length !== MAIN_DECK_SIZE) {
    errors.push(`Main deck must contain exactly ${MAIN_DECK_SIZE} cards (has ${deck.mainDeck.length}).`);
  }

  if (deck.psDeckCount !== PS_DECK_SIZE) {
    errors.push(`Deck must contain exactly ${PS_DECK_SIZE} PLAYERSCORE UP! cards (has ${deck.psDeckCount}).`);
  }

  const nameCounts = new Map();
  const hcMonths = new Set(headCoach.months || []);

  for (const cardId of deck.mainDeck) {
    let card;
    try {
      card = getCard(cardId);
    } catch {
      errors.push(`Unknown card id in main deck: ${cardId}`);
      continue;
    }

    if (![CARD_TYPE.PLAYER, CARD_TYPE.STAR_PLAYER, CARD_TYPE.ASSISTANT_COACH, CARD_TYPE.EVENT].includes(card.type)) {
      errors.push(`${card.name} (${card.type}) cannot be in the main deck.`);
      continue;
    }

    nameCounts.set(card.name, (nameCounts.get(card.name) || 0) + 1);

    // Events are month-unlocked in this set (see RULES_NOTES.md #4); everything else
    // must match one of the Head Coach's months.
    if (card.type !== CARD_TYPE.EVENT) {
      const matchesMonth = (card.months || []).some((m) => hcMonths.has(m));
      if (!matchesMonth) {
        errors.push(
          `${card.name} (${(card.months || []).join("/")}) does not match Head Coach ${headCoach.name}'s month(s) (${[...hcMonths].join("/")}).`
        );
      }
    }
  }

  for (const [name, count] of nameCounts) {
    if (count > MAX_COPIES_PER_NAME) {
      errors.push(`Too many copies of "${name}" (${count}, max ${MAX_COPIES_PER_NAME}).`);
    }
  }

  return { legal: errors.length === 0, errors };
}
