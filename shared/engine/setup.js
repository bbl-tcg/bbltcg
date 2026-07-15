import { getCard } from "./cardDb.js";
import { CARD_TYPE, STARTING_HAND_SIZE, STARTING_SCORE_COUNT } from "./constants.js";
import { createPlayerState, createGameState, log } from "./state.js";
import { shuffle, rollDie } from "./rng.js";
import { playCardToField } from "./primitives.js";

export function initializeGame({ playerADef, playerBDef, rng }) {
  const playerA = createPlayerState(playerADef, rng);
  const playerB = createPlayerState(playerBDef, rng);
  return createGameState({ playerA, playerB, rng });
}

function hasPlayerOrStarPlayer(hand) {
  return hand.some((cardId) => {
    const card = getCard(cardId);
    return card.type === CARD_TYPE.PLAYER || card.type === CARD_TYPE.STAR_PLAYER;
  });
}

/** Draws 5, silently reshuffling until the mandatory "at least 1 Player/StarPlayer" rule is met. */
export function drawOpeningHand(state, playerIndex, rng) {
  const player = state.players[playerIndex];
  let hand;
  do {
    const pool = shuffle([...player.deck, ...player.hand], rng);
    hand = pool.slice(0, STARTING_HAND_SIZE);
    player.deck = pool.slice(STARTING_HAND_SIZE);
  } while (!hasPlayerOrStarPlayer(hand));
  player.hand = hand;
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
  const card = getCard(cardId);
  if (card.type !== CARD_TYPE.PLAYER && card.type !== CARD_TYPE.STAR_PLAYER) {
    return { ok: false, reason: "NOT_A_PLAYER_CARD" };
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
