import { getCard } from "./cardDb.js";
import { CARD_TYPE, PLAYER_SLOT_COUNT } from "./constants.js";
import { nextInstanceId, log, opponentIndex } from "./state.js";
import { effectiveMaxHealth, getStaticFlag } from "./stats.js";

export function createFieldInstance(cardId, turnNumber) {
  const card = getCard(cardId);
  return {
    instanceId: nextInstanceId(),
    cardId,
    currentHealth: card.health,
    attachedPsUp: [],
    hasAttackedThisTurn: false,
    turnPlayed: turnNumber,
    isStarPlayer: card.type === CARD_TYPE.STAR_PLAYER,
    buffs: [], // { id, source, attack, health, speedOverride, expires: 'endOfTurn' | 'permanent' }
    grantedEffects: [], // { id, effectDef, expires: { endOfTurn: N } | 'permanent' } - temporarily-gained abilities (e.g. "gains [SACRIFICE]")
    extraAttacksGrantedThisTurn: 0,
    lastAttack: null, // { targetPlayerIndex, targetInstanceId, turnNumber } - set by combat.declareAttack, read by follow-up effects like Himmy Neutron
    lastDamageTaken: 0, // set whenever this instance takes attack damage; read by ON_KO effects like Cyclops
  };
}

export function drawCard(state, playerIndex, count = 1) {
  const player = state.players[playerIndex];
  const drawn = [];
  for (let i = 0; i < count; i++) {
    if (player.deck.length === 0) break; // deck-out has no defined penalty in the rules; see RULES_NOTES.md
    const cardId = player.deck.shift();
    player.hand.push(cardId);
    drawn.push(cardId);
  }
  if (drawn.length) log(state, { type: "DRAW", playerIndex, count: drawn.length });
  return drawn;
}

/** Unattached, active PS UP available in the bottom-center pool to pay costs with. */
export function payablePsUp(player) {
  return player.psField.filter((p) => p.isActive && !p.attachedTo);
}

export function canAffordCost(player, cost) {
  return payablePsUp(player).length >= cost;
}

/** Rest `cost` active unattached PS UP cards to pay for something. Returns false if
 * unaffordable, otherwise the specific PS UP objects that were rested to pay it - callers
 * that might need to refund this exact payment later (see effectContext.js's
 * cancelEventAndRefund) can re-activate those same objects rather than guessing which ones
 * were "the ones used for this". */
export function payCost(state, playerIndex, cost) {
  const player = state.players[playerIndex];
  if (cost === 0) return [];
  const available = payablePsUp(player);
  if (available.length < cost) return false;
  const used = available.slice(0, cost);
  for (const psUp of used) psUp.isActive = false;
  log(state, { type: "PAY_COST", playerIndex, cost });
  return used;
}

export function drawPsUpFromDeck(state, playerIndex, count) {
  const player = state.players[playerIndex];
  const actual = Math.min(count, player.psDeckCount);
  for (let i = 0; i < actual; i++) {
    player.psField.push({ id: nextInstanceId(), isActive: true, attachedTo: null });
  }
  player.psDeckCount -= actual;
  if (actual) log(state, { type: "PS_DRAW", playerIndex, count: actual });
  return actual;
}

/** Move `count` PS UP cards from the field back into the (undrawn) PS Deck. Prefers unattached ones. */
export function returnPsUpToDeck(state, playerIndex, count) {
  const player = state.players[playerIndex];
  let remaining = count;
  // Unattached first, then detach-and-return attached ones as a last resort.
  const unattached = player.psField.filter((p) => !p.attachedTo);
  const attached = player.psField.filter((p) => p.attachedTo);
  const ordered = [...unattached, ...attached];
  const toRemove = ordered.slice(0, remaining);
  for (const psUp of toRemove) {
    if (psUp.attachedTo) {
      const owner = findFieldInstanceOwnedBy(player, psUp.attachedTo);
      if (owner) owner.attachedPsUp = owner.attachedPsUp.filter((id) => id !== psUp.id);
    }
    player.psField = player.psField.filter((p) => p.id !== psUp.id);
  }
  player.psDeckCount += toRemove.length;
  if (toRemove.length) log(state, { type: "PS_RETURN_TO_DECK", playerIndex, count: toRemove.length });
  return toRemove.length;
}

function findFieldInstanceOwnedBy(player, instanceId) {
  return player.playerSlots.find((inst) => inst && inst.instanceId === instanceId) || null;
}

export function attachPsUp(state, playerIndex, psUpId, targetInstanceId) {
  const player = state.players[playerIndex];
  const psUp = player.psField.find((p) => p.id === psUpId);
  const target = findFieldInstanceOwnedBy(player, targetInstanceId);
  if (!psUp || !target) return false;
  if (!psUp.isActive || psUp.attachedTo) return false;
  if (target.isStarPlayer) return false; // only via explicit effect override, handled by callers
  psUp.attachedTo = targetInstanceId;
  target.attachedPsUp.push(psUpId);
  log(state, { type: "ATTACH_PS_UP", playerIndex, psUpId, targetInstanceId });
  return true;
}

/** Recover phase: full-heal this player's field and return all PS UP (attached or rested) to active/unattached. */
export function recoverPlayer(state, playerIndex) {
  const player = state.players[playerIndex];
  // Detach PS UP (and clear any "gains +N for each attached" tag) *before* recomputing
  // Health below - otherwise a stat bonus tied to a PS UP that's about to detach would get
  // baked into this turn's currentHealth one Recover phase too late.
  for (const psUp of player.psField) {
    psUp.isActive = true;
    psUp.attachedTo = null;
    psUp.bonusPerAttach = null;
  }
  for (const inst of player.playerSlots) {
    if (inst) inst.attachedPsUp = [];
  }
  for (const inst of player.playerSlots) {
    if (!inst) continue;
    inst.hasAttackedThisTurn = false;
    inst.extraAttacksGrantedThisTurn = 0;
    inst.buffs = inst.buffs.filter((b) => b.expires === "permanent");
    inst.grantedEffects = inst.grantedEffects.filter((g) => g.expires === "permanent");
    inst.currentHealth = effectiveMaxHealth(state, playerIndex, inst);
  }
  log(state, { type: "RECOVER", playerIndex });
}

export function findEmptySlot(player) {
  return player.playerSlots.findIndex((s) => s === null);
}

export function isFieldFull(player) {
  return player.playerSlots.every((s) => s !== null);
}

/** Move a field card to the discard pile. If it belongs to a Player/StarPlayer and koedByOpponent, its owner draws a Score card. */
export function moveFieldInstanceToDiscard(state, playerIndex, slotIndex, { koed = false } = {}) {
  const player = state.players[playerIndex];
  const inst = player.playerSlots[slotIndex];
  if (!inst) return;
  const card = getCard(inst.cardId);

  // PLAYERSCORE UP! attached to a player that leaves the field return to the field
  // rested, not active - only a full Recover phase reactivates them.
  for (const psUpId of inst.attachedPsUp) {
    const psUp = player.psField.find((p) => p.id === psUpId);
    if (psUp) {
      psUp.attachedTo = null;
      psUp.isActive = false;
      psUp.bonusPerAttach = null;
    }
  }

  player.playerSlots[slotIndex] = null;
  player.discard.push(inst.cardId);

  log(state, { type: "FIELD_TO_DISCARD", playerIndex, cardId: inst.cardId, instanceId: inst.instanceId, koed });

  if (koed) {
    drawFromScore(state, playerIndex);
  }
}

/** Removes a field card without discarding or KO-scoring it - it goes to the bottom of its owner's deck instead. */
export function moveFieldInstanceToBottomOfDeck(state, playerIndex, slotIndex) {
  const player = state.players[playerIndex];
  const inst = player.playerSlots[slotIndex];
  if (!inst) return;
  for (const psUpId of inst.attachedPsUp) {
    const psUp = player.psField.find((p) => p.id === psUpId);
    if (psUp) {
      psUp.attachedTo = null;
      psUp.isActive = false;
      psUp.bonusPerAttach = null;
    }
  }
  player.playerSlots[slotIndex] = null;
  player.deck.push(inst.cardId);
  log(state, { type: "FIELD_TO_BOTTOM_OF_DECK", playerIndex, cardId: inst.cardId, instanceId: inst.instanceId });
}

export function drawFromScore(state, playerIndex) {
  const player = state.players[playerIndex];
  if (player.score.length === 0) {
    state.gameOver = true;
    state.winner = opponentIndex(playerIndex);
    log(state, { type: "GAME_OVER", loserIndex: playerIndex, reason: "NO_SCORE_CARDS" });
    return;
  }
  const cardId = player.score.shift();
  // "When this card is drawn from the Score, move it directly to the discard pile" (Chris
  // P. Bacon) - checked via a static flag (not a hardcoded cardId) so any future card with
  // the same clause is covered for free.
  if (getStaticFlag({ cardId, buffs: [] }, "discardIfDrawnFromScore") === true) {
    player.discard.push(cardId);
    log(state, { type: "SCORE_DRAWN_TO_DISCARD", playerIndex, cardId });
    return;
  }
  player.hand.push(cardId);
  log(state, { type: "SCORE_DRAWN", playerIndex, cardId });
}

export function playCardToField(state, playerIndex, handIndex, slotIndex, turnNumber) {
  const player = state.players[playerIndex];
  const cardId = player.hand[handIndex];
  if (cardId === undefined) return null;
  player.hand.splice(handIndex, 1);
  const inst = createFieldInstance(cardId, turnNumber);
  player.playerSlots[slotIndex] = inst;
  // Static max-Health modifiers (e.g. Ragnar's conditional +1) should apply from the
  // moment a card enters the field, not just from its owner's next Recover phase.
  inst.currentHealth = effectiveMaxHealth(state, playerIndex, inst);
  log(state, { type: "PLAY_TO_FIELD", playerIndex, cardId, instanceId: inst.instanceId, slotIndex });
  return inst;
}

export function playAssistantCoach(state, playerIndex, handIndex) {
  const player = state.players[playerIndex];
  if (player.assistantCoach) return false;
  const cardId = player.hand[handIndex];
  if (cardId === undefined) return false;
  player.hand.splice(handIndex, 1);
  player.assistantCoach = { cardId };
  log(state, { type: "PLAY_ASSISTANT_COACH", playerIndex, cardId });
  return true;
}

export function discardFromHand(state, playerIndex, handIndex) {
  const player = state.players[playerIndex];
  const cardId = player.hand[handIndex];
  if (cardId === undefined) return null;
  player.hand.splice(handIndex, 1);
  player.discard.push(cardId);
  log(state, { type: "DISCARD", playerIndex, cardId });
  return cardId;
}

export function playEvent(state, playerIndex, handIndex) {
  const player = state.players[playerIndex];
  const cardId = player.hand[handIndex];
  if (cardId === undefined) return null;
  player.hand.splice(handIndex, 1);
  player.discard.push(cardId);
  log(state, { type: "PLAY_EVENT", playerIndex, cardId });
  return cardId;
}

export { PLAYER_SLOT_COUNT };
