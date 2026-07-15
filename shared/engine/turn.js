import { PHASE } from "./constants.js";
import { log, opponentIndex } from "./state.js";
import { recoverPlayer, drawCard, drawPsUpFromDeck, drawFromScore } from "./primitives.js";

/** Runs Recover -> Draw -> PS Draw automatically, then hands control to the Main phase. */
export function startTurn(state) {
  const playerIndex = state.activePlayerIndex;
  const player = state.players[playerIndex];

  state.phase = PHASE.RECOVER;
  recoverPlayer(state, playerIndex);

  const firstTurnOfGameForThisPlayer = player.turnsTaken === 0;
  player.turnsTaken += 1;

  state.phase = PHASE.DRAW;
  drawCard(state, playerIndex, 1);

  state.phase = PHASE.PS_DRAW;
  // Only the very first player, on the very first turn of the whole game, is limited to
  // drawing 1 PLAYERSCORE UP! instead of 2 (see original rules: "they only draw 1
  // PLAYERSCORE UP! during this turn ... they return to normal for every other turn").
  const isVeryFirstTurnOfGame = state.turnNumber === 1 && playerIndex === state.firstPlayerIndex;
  drawPsUpFromDeck(state, playerIndex, isVeryFirstTurnOfGame ? 1 : 2);

  state.turnFlags.attacksAllowed = !firstTurnOfGameForThisPlayer;

  state.phase = PHASE.MAIN;
  log(state, { type: "MAIN_PHASE_START", playerIndex, attacksAllowed: state.turnFlags.attacksAllowed });
}

function fieldIsEmpty(player) {
  return player.playerSlots.every((s) => s === null);
}

/** Buffs/granted abilities tagged `{ endOfTurn: N }` (e.g. "gains [SACRIFICE] until your
 * opponent's End Phase") expire here. */
function sweepEndOfTurnBuffs(state, endingTurnNumber) {
  for (const player of state.players) {
    for (const inst of player.playerSlots) {
      if (!inst) continue;
      inst.buffs = inst.buffs.filter((b) => !(b.expires && b.expires.endOfTurn === endingTurnNumber));
      inst.grantedEffects = inst.grantedEffects.filter((g) => !(g.expires && g.expires.endOfTurn === endingTurnNumber));
    }
  }
}

export function endTurn(state) {
  const playerIndex = state.activePlayerIndex;
  const player = state.players[playerIndex];
  state.phase = PHASE.END;

  if (fieldIsEmpty(player)) {
    drawFromScore(state, playerIndex);
    if (state.gameOver) return;
  }

  sweepEndOfTurnBuffs(state, state.turnNumber);
  log(state, { type: "END_TURN", playerIndex });

  state.activePlayerIndex = opponentIndex(playerIndex);
  state.turnNumber += 1;
}
