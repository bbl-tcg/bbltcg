import { getCard } from "./cardDb.js";
import { CARD_TYPE, OPENING_FIELD_MAX_COST, STARTING_HAND_SIZE, STARTING_SCORE_COUNT } from "./constants.js";
import { createPlayerState, createGameState, log } from "./state.js";
import { shuffle, rollDie } from "./rng.js";
import { playCardToField } from "./primitives.js";

export function initializeGame({ playerADef, playerBDef, rng }) {
  const playerA = createPlayerState(playerADef, rng);
  const playerB = createPlayerState(playerBDef, rng);
  return createGameState({ playerA, playerB, rng });
}

/** STAR Players and Cost 3+ Players can't be put on the field at setup - so a legal
 * opening-field choice requires a Cost <= 3 (non-Star) Player somewhere in hand. */
export function isEligibleForOpeningField(cardId) {
  const card = getCard(cardId);
  return card.type === CARD_TYPE.PLAYER && card.cost <= OPENING_FIELD_MAX_COST;
}

function hasEligibleOpeningFieldCard(hand) {
  return hand.some(isEligibleForOpeningField);
}

/** Draws 5, silently reshuffling until the mandatory "at least 1 opening-field-eligible
 * Player" rule is met (a Cost 3 or less Player, since Star Players and Cost 3+ Players
 * can't be played to the field for free at setup).
 *
 * The combined deck+hand pool is captured ONCE before the retry loop, not rebuilt from
 * `player.deck`/`player.hand` on every iteration - those aren't updated until a winning
 * hand is found, so re-reading them mid-loop would silently drop each rejected attempt's
 * 5 cards into the void (they'd be in neither the shrinking `player.deck` nor the
 * still-stale `player.hand`), permanently shrinking the deck by 5 per retry. This was the
 * root cause of decks randomly ending up short by some multiple of 5 cards. */
export function drawOpeningHand(state, playerIndex, rng) {
  const player = state.players[playerIndex];
  const fullPool = [...player.deck, ...player.hand];
  let hand;
  let remainingDeck;
  do {
    const pool = shuffle(fullPool, rng);
    hand = pool.slice(0, STARTING_HAND_SIZE);
    remainingDeck = pool.slice(STARTING_HAND_SIZE);
  } while (!hasEligibleOpeningFieldCard(hand));
  player.hand = hand;
  player.deck = remainingDeck;
  log(state, { type: "OPENING_HAND", playerIndex });
  return hand;
}

/** The player's one optional mulligan (only usable before it's been used, and before a hand is kept). */
export function mulligan(state, playerIndex, rng) {
  const player = state.players[playerIndex];
  if (!player.mulliganAvailable) return false;
  player.mulliganAvailable = false;
  drawOpeningHand(state, playerIndex, rng);
  log(state, { type: "MULLIGAN", playerIndex });
  return true;
}

export function keepHand(state, playerIndex) {
  state.players[playerIndex].mulliganAvailable = false;
}

export function drawScoreCards(state, playerIndex) {
  const player = state.players[playerIndex];
  for (let i = 0; i < STARTING_SCORE_COUNT; i++) {
    const cardId = player.deck.shift();
    if (cardId) player.score.push(cardId);
  }
  log(state, { type: "SCORE_SET", playerIndex, count: player.score.length });
}

export function playOpeningCard(state, playerIndex, handIndex) {
  const player = state.players[playerIndex];
  const cardId = player.hand[handIndex];
  if (!isEligibleForOpeningField(cardId)) {
    return { ok: false, reason: "NOT_ELIGIBLE_FOR_OPENING_FIELD" };
  }
  const inst = playCardToField(state, playerIndex, handIndex, 0, 0);
  return { ok: true, instance: inst };
}

/** Die roll to decide who picks turn order; rerolls automatically on a tie. */
export function rollForFirstPick(rng) {
  let a;
  let b;
  do {
    a = rollDie(rng);
    b = rollDie(rng);
  } while (a === b);
  return { playerARoll: a, playerBRoll: b, winnerIndex: a > b ? 0 : 1 };
}

export function setFirstPlayer(state, playerIndex) {
  state.firstPlayerIndex = playerIndex;
  state.activePlayerIndex = playerIndex;
  state.turnNumber = 1;
}
