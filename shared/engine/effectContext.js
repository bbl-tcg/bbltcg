import { getCard } from "./cardDb.js";
import { log, opponentIndex, nextInstanceId } from "./state.js";
import {
  drawCard,
  payCost,
  canAffordCost,
  attachPsUp,
  returnPsUpToDeck,
  discardFromHand,
  moveFieldInstanceToDiscard,
  moveFieldInstanceToBottomOfDeck,
  createFieldInstance,
  findEmptySlot,
  isFieldFull,
} from "./primitives.js";
import { dealDamage } from "./combat.js";
import { shuffle } from "./rng.js";

/**
 * Build the helper object passed to an effect's canActivate()/resolve(). `controllerIndex`
 * is whoever controls the card the effect belongs to; `source` identifies the card itself.
 */
export function makeEffectContext(state, { controllerIndex, source }) {
  const self = controllerIndex;
  const opponent = opponentIndex(controllerIndex);

  return {
    state,
    self,
    opponent,
    source,

    player: (i = self) => state.players[i],
    card: (cardId) => getCard(cardId),

    draw: (playerIndex, count = 1) => drawCard(state, playerIndex, count),

    discardFromHandAt: (playerIndex, handIndex) => discardFromHand(state, playerIndex, handIndex),
    discardFromHandById: (playerIndex, cardId) => {
      const hand = state.players[playerIndex].hand;
      const idx = hand.indexOf(cardId);
      if (idx === -1) return null;
      return discardFromHand(state, playerIndex, idx);
    },

    millToDiscard: (playerIndex, count = 1) => {
      const player = state.players[playerIndex];
      const moved = [];
      for (let i = 0; i < count && player.deck.length; i++) {
        const cardId = player.deck.shift();
        player.discard.push(cardId);
        moved.push(cardId);
      }
      if (moved.length) log(state, { type: "MILL", playerIndex, count: moved.length });
      return moved;
    },

    canAfford: (playerIndex, cost) => canAffordCost(state.players[playerIndex], cost),
    payCost: (playerIndex, cost) => payCost(state, playerIndex, cost),

    attachPsUp: (playerIndex, psUpId, targetInstanceId) => attachPsUp(state, playerIndex, psUpId, targetInstanceId),
    /** Effect-driven attach that bypasses the "must be active" / "not a Star Player" restrictions,
     * per "unless an effect dictates otherwise." Preserves the PS UP's active/rested state as-is -
     * attachment doesn't itself activate a rested one, only the next Recover phase does. */
    attachPsUpForced: (playerIndex, psUpId, targetInstanceId) => {
      const p = state.players[playerIndex];
      const psUp = p.psField.find((x) => x.id === psUpId);
      const target = p.playerSlots.find((s) => s && s.instanceId === targetInstanceId);
      if (!psUp || !target || psUp.attachedTo) return false;
      psUp.attachedTo = targetInstanceId;
      target.attachedPsUp.push(psUpId);
      log(state, { type: "ATTACH_PS_UP", playerIndex, psUpId, targetInstanceId, forced: true });
      return true;
    },
    returnPsUpToDeck: (playerIndex, count) => returnPsUpToDeck(state, playerIndex, count),
    addPsUpFromDeckToField: (playerIndex, count = 1) => {
      const player = state.players[playerIndex];
      const actual = Math.min(count, player.psDeckCount);
      for (let i = 0; i < actual; i++) {
        player.psField.push({ id: nextInstanceId(), isActive: true, attachedTo: null });
      }
      player.psDeckCount -= actual;
      if (actual) log(state, { type: "PS_DRAW", playerIndex, count: actual });
      return actual;
    },
    activateRestedPsUp: (playerIndex, count = 1) => {
      const player = state.players[playerIndex];
      const rested = player.psField.filter((p) => !p.isActive && !p.attachedTo).slice(0, count);
      for (const p of rested) p.isActive = true;
      return rested.length;
    },

    dealDamage: (targetPlayerIndex, targetSlot, amount) => dealDamage(state, { targetPlayerIndex, targetSlot, amount, source }),

    koSlot: (playerIndex, slot) => moveFieldInstanceToDiscard(state, playerIndex, slot, { koed: true }),
    discardFieldSlot: (playerIndex, slot) => moveFieldInstanceToDiscard(state, playerIndex, slot, { koed: false }),
    bottomDeckFieldSlot: (playerIndex, slot) => moveFieldInstanceToBottomOfDeck(state, playerIndex, slot),

    findEmptySlot: (playerIndex) => findEmptySlot(state.players[playerIndex]),
    isFieldFull: (playerIndex) => isFieldFull(state.players[playerIndex]),

    playFreeToField: (playerIndex, cardId, slotIndex, fromZone = "hand") => {
      const player = state.players[playerIndex];
      const zoneArr = fromZone === "hand" ? player.hand : player.discard;
      const idx = zoneArr.indexOf(cardId);
      if (idx === -1) return null;
      zoneArr.splice(idx, 1);
      const inst = createFieldInstance(cardId, state.turnNumber);
      player.playerSlots[slotIndex] = inst;
      log(state, { type: "PLAY_TO_FIELD", playerIndex, cardId, instanceId: inst.instanceId, slotIndex, free: true, fromZone });
      return inst;
    },
    /** Like playFreeToField, but for a card that isn't sitting in any zone array right now
     * (e.g. already pulled out mid-resolution while "revealing" cards from the deck). */
    placeCardOnField: (playerIndex, cardId, slotIndex) => {
      const player = state.players[playerIndex];
      if (player.playerSlots[slotIndex]) return null;
      const inst = createFieldInstance(cardId, state.turnNumber);
      player.playerSlots[slotIndex] = inst;
      log(state, { type: "PLAY_TO_FIELD", playerIndex, cardId, instanceId: inst.instanceId, slotIndex, free: true, fromZone: "reveal" });
      return inst;
    },

    /**
     * Directly raises/lowers current Health right now (e.g. "+2 Health until your opponent's
     * End Phase"). No expiry bookkeeping is needed: a player's own Recover phase always
     * resets their field to full Health regardless, and that phase runs at the very start of
     * their next turn, so a same-turn boost never survives past the moment it stops mattering.
     */
    healCurrent: (instanceId, amount) => {
      const found = findInstanceAnywhere(state, instanceId);
      if (!found) return false;
      found.instance.currentHealth += amount;
      return true;
    },

    /** "Regains any Health lost as a result of this event [unless KOed]" style effects. */
    scheduleRestoreIfSurvives: (instanceId, amount) => {
      state.pendingRestores.push({ instanceId, amount });
    },

    /** "If it is discarded as a result of this attack, choose 1 player on your opponent's
     * field to be put at the bottom of their deck" (Ricky Covey Jr.) and similar one-off
     * "if X happens as a result of this attack, do Y" follow-ups. */
    schedulePostAttackHook: (hook) => {
      state.pendingPostAttackHooks.push(hook);
    },

    /** Same idea as schedulePostAttackHook, but for non-attack effects (e.g. Scottie's
     * "if this player is still on the field after the [redirected] effect, discard it"). */
    schedulePostEffectHook: (hook) => {
      state.pendingPostEffectHooks.push(hook);
    },

    addBuff: (instanceId, buff) => {
      const found = findInstanceAnywhere(state, instanceId);
      if (!found) return false;
      found.instance.buffs.push({ id: nextInstanceId(), ...buff });
      return true;
    },

    /** "Gains [KEYWORD] until ..." - temporarily grants this instance another card's EffectDef. */
    grantEffect: (instanceId, effectDef, expires) => {
      const found = findInstanceAnywhere(state, instanceId);
      if (!found) return false;
      found.instance.grantedEffects.push({ id: nextInstanceId(), effectDef, expires });
      return true;
    },

    findInstance: (instanceId) => findInstanceAnywhere(state, instanceId),

    searchZone: (playerIndex, zone, predicate) => {
      const player = state.players[playerIndex];
      const arr = zone === "deck" ? player.deck : zone === "discard" ? player.discard : player.hand;
      return arr.map((cardId, index) => ({ cardId, index, card: getCard(cardId) })).filter((e) => predicate(e.card));
    },

    shuffleDeck: (playerIndex) => {
      const player = state.players[playerIndex];
      player.deck = shuffle(player.deck, state.rng);
    },
    rng: () => state.rng(),

    log: (event) => log(state, event),
  };
}

function findInstanceAnywhere(state, instanceId) {
  for (let pIndex = 0; pIndex < state.players.length; pIndex++) {
    const player = state.players[pIndex];
    const slot = player.playerSlots.findIndex((inst) => inst && inst.instanceId === instanceId);
    if (slot !== -1) return { instance: player.playerSlots[slot], playerIndex: pIndex, slot };
  }
  return null;
}
