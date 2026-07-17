import { PHASE } from "./constants.js";
import { log, opponentIndex } from "./state.js";
import { recoverPlayer, drawCard, drawPsUpFromDeck, drawFromScore } from "./primitives.js";
import { getStaticFlag } from "./stats.js";

/** "If it is the only player on your field at the start of your turn, move this player
 * from your field to your Score face-up (gain 1 life)" - Chris P. Bacon and any future
 * card with the same automatic (non-optional) start-of-turn clause. */
function autoScoreIfAloneAtTurnStart(state, playerIndex) {
  const player = state.players[playerIndex];
  const onField = player.playerSlots.filter((s) => s);
  if (onField.length !== 1) return;
  const [inst] = onField;
  if (getStaticFlag(inst, "autoScoreIfAloneAtTurnStart") !== true) return;
  const slot = player.playerSlots.findIndex((s) => s === inst);
  player.playerSlots[slot] = null;
  player.score.push(inst.cardId); // "face-up" is a display distinction for the UI, not tracked separately here
  log(state, { type: "AUTO_SCORED", playerIndex, cardId: inst.cardId });
}

/** Runs Recover -> Draw -> PS Draw automatically, then hands control to the Main phase. */
export function startTurn(state) {
  const playerIndex = state.activePlayerIndex;
  const player = state.players[playerIndex];

  state.phase = PHASE.RECOVER;
  recoverPlayer(state, playerIndex);
  autoScoreIfAloneAtTurnStart(state, playerIndex);

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
  state.turnFlags.eventsPlayedThisTurnBy = [];
  // A fresh turn re-opens every YOUR_TURN/OPPONENTS_TURN effect source for both players -
  // see engine.js's ONCE_PER_TURN_TRIGGERS for why this is scoped to "any startTurn()", not
  // just the active player's own.
  state.turnFlags.activatedStandingEffectsThisTurn = [];

  state.phase = PHASE.MAIN;
  log(state, { type: "MAIN_PHASE_START", playerIndex, attacksAllowed: state.turnFlags.attacksAllowed });
}

function fieldIsEmpty(player) {
  return player.playerSlots.every((s) => s === null);
}

/** Buffs/granted abilities tagged `{ endOfTurn: N }` (e.g. "gains [SACRIFICE] until your
 * opponent's End Phase") expire here. A buff carrying `healthReversion: N` (a swap that
 * outlives the next Recover phase on either side, e.g. Coach Cap's Health swap "until your
 * opponent's next End Phase") also restores Health to that value as it expires. */
function sweepEndOfTurnBuffs(state, endingTurnNumber) {
  for (const player of state.players) {
    for (const inst of player.playerSlots) {
      if (!inst) continue;
      const expiring = inst.buffs.filter((b) => b.expires && b.expires.endOfTurn === endingTurnNumber);
      for (const b of expiring) {
        if (typeof b.healthReversion === "number") inst.currentHealth = b.healthReversion;
      }
      inst.buffs = inst.buffs.filter((b) => !(b.expires && b.expires.endOfTurn === endingTurnNumber));
      inst.grantedEffects = inst.grantedEffects.filter((g) => !(g.expires && g.expires.endOfTurn === endingTurnNumber));
    }
  }
  state.handCostModifiers = state.handCostModifiers.filter((m) => !(m.expires && m.expires.endOfTurn === endingTurnNumber));
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
