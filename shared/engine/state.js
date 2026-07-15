import { getCard } from "./cardDb.js";
import { CARD_TYPE, PHASE, PLAYER_SLOT_COUNT, PS_DECK_SIZE, STARTING_SCORE_COUNT } from "./constants.js";
import { shuffle } from "./rng.js";

let instanceCounter = 0;
export function nextInstanceId() {
  instanceCounter += 1;
  return `inst_${instanceCounter}`;
}

/** Reset the instance id counter (test harness only, keeps fixtures readable). */
export function resetInstanceIdCounter() {
  instanceCounter = 0;
}

export function createPlayerState({ id, name, headCoachId, mainDeck, psDeckCount = PS_DECK_SIZE }, rng) {
  const headCoachCard = getCard(headCoachId);
  if (headCoachCard.type !== CARD_TYPE.HEAD_COACH) {
    throw new Error(`${headCoachId} is not a Head Coach`);
  }

  return {
    id,
    name,
    headCoach: { cardId: headCoachId },
    assistantCoach: null,
    playerSlots: new Array(PLAYER_SLOT_COUNT).fill(null),
    psField: [], // { id, isActive, attachedTo: instanceId|null }
    psDeckCount,
    deck: shuffle(mainDeck, rng),
    hand: [],
    discard: [],
    score: [],
    mulliganAvailable: true,
    hasPlayedOpeningPlayer: false,
    packPoints: 0,
    turnsTaken: 0,
  };
}

export function createGameState({ playerA, playerB, rng }) {
  return {
    turnNumber: 0,
    activePlayerIndex: 0,
    firstPlayerIndex: null,
    phase: PHASE.RECOVER,
    players: [playerA, playerB],
    turnFlags: {
      attacksAllowed: true,
      attackedThisGameByInstance: {}, // instanceId -> bool, used by some "first attack" effects
    },
    winner: null,
    log: [],
    pendingChoice: null,
    gameOver: false,
    rng, // shared PRNG for the whole game (shuffles, coin flips triggered by effects, etc.)
    pendingRestores: [], // [{ instanceId, amount }] - "regains Health lost... unless KOed" style effects, processed right after the attack that triggered them resolves
  };
}

export function opponentIndex(playerIndex) {
  return playerIndex === 0 ? 1 : 0;
}

export function activePlayer(state) {
  return state.players[state.activePlayerIndex];
}

export function inactivePlayer(state) {
  return state.players[opponentIndex(state.activePlayerIndex)];
}

export function findInstance(state, instanceId) {
  for (let pIndex = 0; pIndex < state.players.length; pIndex++) {
    const player = state.players[pIndex];
    for (let slot = 0; slot < player.playerSlots.length; slot++) {
      const inst = player.playerSlots[slot];
      if (inst && inst.instanceId === instanceId) {
        return { instance: inst, playerIndex: pIndex, slot };
      }
    }
  }
  return null;
}

export function findPsUp(state, psUpId) {
  for (let pIndex = 0; pIndex < state.players.length; pIndex++) {
    const player = state.players[pIndex];
    const psUp = player.psField.find((p) => p.id === psUpId);
    if (psUp) return { psUp, playerIndex: pIndex };
  }
  return null;
}

export function log(state, event) {
  state.log.push({ turn: state.turnNumber, phase: state.phase, ...event });
}
