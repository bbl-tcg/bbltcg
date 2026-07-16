import { getCard } from "./cardDb.js";
import { CARD_TYPE, TRIGGER } from "./constants.js";
import { log, opponentIndex } from "./state.js";
import {
  payCost,
  canAffordCost,
  playCardToField,
  playAssistantCoach,
  playEvent,
  findEmptySlot,
  moveFieldInstanceToDiscard,
  moveFieldInstanceToBottomOfDeck,
} from "./primitives.js";
import { declareAttack } from "./combat.js";
import { canAttack, getStaticFlag, isSilenced, effectiveHandCost } from "./stats.js";
import { getEffect } from "./effectRegistry.js";
import { makeEffectContext } from "./effectContext.js";
import { runEffect } from "./effectRunner.js";
import { endTurn as endTurnPhase } from "./turn.js";

/**
 * Every source of an activatable effect currently on a player's board: their Head
 * Coach, their Assistant Coach (if any), and each Player/Star Player in their slots.
 * Star Players contribute both their main effect and Star Power as separate sources.
 */
function effectSources(state, controllerIndex) {
  const player = state.players[controllerIndex];
  const sources = [];

  const hcCard = getCard(player.headCoach.cardId);
  const hcEffect = getEffect(player.headCoach.cardId);
  if (hcEffect) sources.push({ cardId: hcCard.id, zone: "HEAD_COACH", instanceId: null, effectDef: hcEffect, label: "main" });

  if (player.assistantCoach) {
    const acEffect = getEffect(player.assistantCoach.cardId);
    if (acEffect) sources.push({ cardId: player.assistantCoach.cardId, zone: "ASSISTANT_COACH", instanceId: null, effectDef: acEffect, label: "main" });
  }

  player.playerSlots.forEach((inst, slot) => {
    if (!inst) return;
    const effectDef = getEffect(inst.cardId);
    if (effectDef) {
      if (effectDef.main) {
        sources.push({ cardId: inst.cardId, zone: "FIELD", instanceId: inst.instanceId, slot, effectDef: effectDef.main, label: "main" });
        if (effectDef.starPower) {
          sources.push({ cardId: inst.cardId, zone: "FIELD", instanceId: inst.instanceId, slot, effectDef: effectDef.starPower, label: "starPower" });
        }
      } else {
        sources.push({ cardId: inst.cardId, zone: "FIELD", instanceId: inst.instanceId, slot, effectDef, label: "main" });
      }
    }
    inst.grantedEffects.forEach((granted, i) => {
      sources.push({ cardId: inst.cardId, zone: "FIELD", instanceId: inst.instanceId, slot, effectDef: granted.effectDef, label: `granted:${i}` });
    });
  });

  // Event cards in hand are also effect sources: their trigger dictates *when* they can be
  // played (e.g. an ON_OPPONENTS_ATTACK event is only playable during that reactive window),
  // not a passive ability sitting on the field.
  player.hand.forEach((cardId, handIndex) => {
    const card = getCard(cardId);
    if (card.type !== CARD_TYPE.EVENT) return;
    const effectDef = getEffect(cardId);
    if (!effectDef) return;
    sources.push({ cardId, zone: "HAND", handIndex, effectDef, label: "main", cost: card.cost, card });
  });

  return sources;
}

/** Sources whose trigger matches the currently open window and (if defined) pass canActivate. */
export function getActivatableSources(state, controllerIndex, triggerType, windowCtx = {}) {
  const player = state.players[controllerIndex];
  return effectSources(state, controllerIndex).filter((src) => {
    if (src.effectDef.trigger !== triggerType) return false;
    if (src.zone === "HAND" && !canAffordCost(player, effectiveHandCost(state, controllerIndex, src.card))) return false;
    // WHILE_ATTACKING is specifically "while *this* card is attacking" (e.g. Skuba Doo's
    // PUMMEL DOWN, Silvia Snipes' CLUTCH) - not any teammate's attack, even though the
    // window is opened once per attack across the whole team's sources.
    if (triggerType === TRIGGER.WHILE_ATTACKING && windowCtx.attackerInstanceId && src.instanceId !== windowCtx.attackerInstanceId) {
      return false;
    }
    // "The chosen player has no effect until your End Phase" (Kimi Raikonnen) - a silenced
    // field card's activatable abilities (granted ones included) are unavailable, though the
    // card itself stays on the field.
    if (src.zone === "FIELD" && src.instanceId) {
      const inst = state.players[controllerIndex].playerSlots.find((s) => s && s.instanceId === src.instanceId);
      if (inst && isSilenced(inst)) return false;
    }
    const ctx = makeEffectContext(state, { controllerIndex, source: src });
    if (src.effectDef.canActivate) return !!src.effectDef.canActivate(ctx, windowCtx);
    return true;
  });
}

/**
 * Defaults a yielded choice request's `forPlayer` to whoever controls the effect being
 * resolved, unless the effect explicitly overrides it (e.g. `forPlayer: ctx.opponent`).
 * Without this, a caller holding a single shared `resolveChoice` function for a whole
 * action (as the multiplayer room does) has no way to know which seat a given request
 * actually belongs to, and choices tied to a reactive card would always fall back to
 * whatever default the caller picked - almost always wrong for the defending/reacting
 * player's own effects.
 */
function scopedResolver(resolveChoice, controllerIndex) {
  return (request) => resolveChoice({ ...request, forPlayer: request.forPlayer ?? controllerIndex });
}

/** Runs one chosen source's effect: pays cost + discards from hand first for Events, then resolves. */
async function activateSource(state, controllerIndex, source, windowCtx, resolveChoice) {
  if (source.zone === "HAND") {
    payCost(state, controllerIndex, effectiveHandCost(state, controllerIndex, source.card));
    playEvent(state, controllerIndex, source.handIndex);
    state.turnFlags.eventsPlayedThisTurnBy.push(controllerIndex);
  }
  const ctx = makeEffectContext(state, { controllerIndex, source });
  if (source.effectDef.resolve) {
    await runEffect(source.effectDef.resolve(ctx, windowCtx), scopedResolver(resolveChoice, controllerIndex));
  }
  log(state, { type: "EFFECT_ACTIVATED", controllerIndex, cardId: source.cardId, trigger: source.effectDef.trigger, label: source.label });
  processPendingPostEffectHooks(state);
}

/** See effectContext.js's schedulePostEffectHook doc comment. */
function processPendingPostEffectHooks(state) {
  if (!state.pendingPostEffectHooks.length) return;
  const hooks = state.pendingPostEffectHooks;
  state.pendingPostEffectHooks = [];
  for (const hook of hooks) {
    if (hook.type === "DISCARD_IF_SURVIVED") {
      const found = findFieldSlotByInstanceId(state, hook.instanceId);
      if (found) moveFieldInstanceToDiscard(state, found.playerIndex, found.slot, { koed: false });
    }
  }
}

function findFieldSlotByInstanceId(state, instanceId) {
  for (let playerIndex = 0; playerIndex < state.players.length; playerIndex++) {
    const slot = state.players[playerIndex].playerSlots.findIndex((s) => s && s.instanceId === instanceId);
    if (slot !== -1) return { playerIndex, slot };
  }
  return null;
}

function sourceKey(src) {
  return `${src.cardId}:${src.zone}:${src.instanceId ?? src.handIndex ?? ""}:${src.label}`;
}

/**
 * Open a decision window of a given trigger type for `controllerIndex`. `decide` is called
 * repeatedly with the list of currently-activatable sources and must resolve to either
 * `null` (pass / stop) or one of the sources to activate; `resolveChoice` answers any
 * internal choice the activated effect's generator yields. Loops until the controller
 * passes or nothing is left to activate.
 *
 * Each distinct source can only be activated once per openWindow call - a source whose
 * canActivate condition is still true *after* it resolves (e.g. "if a teammate has already
 * attacked this turn" doesn't change just from using the ability) would otherwise offer
 * itself again forever. A card that genuinely wants repeat-activations within one window
 * is rare enough to not warrant plumbing an opt-out for it yet.
 */
export async function openWindow(state, controllerIndex, triggerType, windowCtx, decide, resolveChoice) {
  const activatedKeys = new Set();
  for (;;) {
    const available = getActivatableSources(state, controllerIndex, triggerType, windowCtx).filter((src) => !activatedKeys.has(sourceKey(src)));
    if (available.length === 0) return;
    const chosen = await decide(available, windowCtx);
    if (!chosen) return;
    activatedKeys.add(sourceKey(chosen));
    await activateSource(state, controllerIndex, chosen, windowCtx, resolveChoice);
  }
}

// ---- Player-initiated actions (Main phase) ----

export function canPlayCard(state, playerIndex, handIndex) {
  const player = state.players[playerIndex];
  const cardId = player.hand[handIndex];
  if (!cardId) return { ok: false, reason: "NO_CARD" };
  const card = getCard(cardId);
  if (card.type === CARD_TYPE.HEAD_COACH) return { ok: false, reason: "HEAD_COACH_NOT_PLAYABLE_FROM_HAND" };
  if (card.type === CARD_TYPE.ASSISTANT_COACH && player.assistantCoach) {
    return { ok: false, reason: "ASSISTANT_COACH_SLOT_OCCUPIED" };
  }
  const cost = effectiveHandCost(state, playerIndex, card);
  if (!canAffordCost(player, cost)) return { ok: false, reason: "CANNOT_AFFORD" };
  return { ok: true, card, cost };
}

/**
 * Play a Player/Star Player/Assistant Coach card from hand to the field. Event cards are
 * not played through here — they're activated via activateEffectAction/openWindow like any
 * other effect source, since their trigger (not "your main phase") dictates when they're
 * legal to use. `replaceSlot` is required (0-2) when the 3 player slots are already full
 * and the acting player must pick which existing card to discard, per RULES_NOTES.md #6.
 */
export async function playCard(state, playerIndex, handIndex, { replaceSlot = null } = {}, resolveChoice) {
  const check = canPlayCard(state, playerIndex, handIndex);
  if (!check.ok) return check;
  const { card, cost } = check;
  const player = state.players[playerIndex];
  if (card.type === CARD_TYPE.EVENT) return { ok: false, reason: "EVENTS_PLAYED_VIA_ACTIVATE_EFFECT" };

  if (!payCost(state, playerIndex, cost)) return { ok: false, reason: "CANNOT_AFFORD" };

  let instance = null;
  let instanceSlot = null;
  if (card.type === CARD_TYPE.PLAYER || card.type === CARD_TYPE.STAR_PLAYER) {
    if (card.type === CARD_TYPE.STAR_PLAYER && player.playerSlots.some((s) => s && s.isStarPlayer)) {
      return { ok: false, reason: "STAR_PLAYER_ALREADY_ON_FIELD" };
    }
    // "Only one Chris P. Bacon can be on the field at a time" and any future card with the
    // same restriction.
    if (getStaticFlag({ cardId: card.id, buffs: [] }, "uniqueOnField") === true && player.playerSlots.some((s) => s && s.cardId === card.id)) {
      return { ok: false, reason: "UNIQUE_CARD_ALREADY_ON_FIELD" };
    }
    let slot = findEmptySlot(player);
    if (slot === -1) {
      if (replaceSlot === null) return { ok: false, reason: "NEEDS_REPLACE_SLOT" };
      moveFieldInstanceToDiscard(state, playerIndex, replaceSlot, { koed: false });
      slot = replaceSlot;
    }
    instance = playCardToField(state, playerIndex, handIndex, slot, state.turnNumber);
    instanceSlot = slot;
  } else if (card.type === CARD_TYPE.ASSISTANT_COACH) {
    playAssistantCoach(state, playerIndex, handIndex);
  }

  const source =
    card.type === CARD_TYPE.ASSISTANT_COACH
      ? { cardId: card.id, zone: "ASSISTANT_COACH", instanceId: null }
      : instance
        ? { cardId: card.id, zone: "FIELD", instanceId: instance.instanceId, slot: instanceSlot }
        : null;

  if (source) {
    const effectDef = getEffect(card.id);
    const onPlayDef = effectDef?.main || effectDef;
    if (onPlayDef && onPlayDef.trigger === TRIGGER.ON_PLAY) {
      const ctx = makeEffectContext(state, { controllerIndex: playerIndex, source: { ...source, effectDef: onPlayDef, label: "main" } });
      if (!onPlayDef.canActivate || onPlayDef.canActivate(ctx)) {
        await runEffect(onPlayDef.resolve(ctx), scopedResolver(resolveChoice, playerIndex));
      }
    }
  }

  return { ok: true, instance };
}

export function canAttackWith(state, playerIndex, slot) {
  if (!state.turnFlags.attacksAllowed) return false;
  const inst = state.players[playerIndex].playerSlots[slot];
  if (!inst) return false;
  return canAttack(state, playerIndex, inst, false);
}

const defaultDecideWindow = async (controllerIndex, available) => (available.length ? available[0] : null);

/**
 * `windowCtx` is mutable and passed by reference through every window: a SACRIFICE-triggered
 * redirect effect (e.g. Rafael Murray) can rewrite `windowCtx.targetSlot` mid-flow, and the
 * final `declareAttack` call reads the (possibly redirected) target back out of it.
 *
 * `decideWindow(controllerIndex, available, windowCtx)` picks which (if any) activatable
 * source to use at each reactive window - callers with a real human in the loop MUST pass
 * one that actually asks (including a "do nothing" option), since a player should always be
 * free to decline reacting to an attack. The default (auto-pick-first) is only appropriate
 * for headless tests/simulations, never for real gameplay.
 */
export async function attack(state, { attackerPlayerIndex, attackerSlot, targetPlayerIndex, targetSlot }, resolveChoice, decideWindow = defaultDecideWindow) {
  if (!canAttackWith(state, attackerPlayerIndex, attackerSlot)) return { ok: false, reason: "CANNOT_ATTACK" };

  const attackerInst = state.players[attackerPlayerIndex].playerSlots[attackerSlot];
  const targetInst = state.players[targetPlayerIndex].playerSlots[targetSlot];
  if (targetInst) {
    const blocksAttack = getEffect(targetInst.cardId);
    const targetStatic = blocksAttack?.main ? [blocksAttack.main, blocksAttack.starPower] : [blocksAttack];
    for (const def of targetStatic) {
      if (def?.trigger === null && def.staticEffect?.blocksAttackFrom) {
        const targetCtx = makeEffectContext(state, { controllerIndex: targetPlayerIndex, source: { cardId: targetInst.cardId, zone: "FIELD", instanceId: targetInst.instanceId, slot: targetSlot } });
        if (def.staticEffect.blocksAttackFrom(targetCtx, attackerInst)) return { ok: false, reason: "TARGET_IMMUNE" };
      }
    }
  }

  const windowCtx = { attackerPlayerIndex, attackerSlot, targetPlayerIndex, targetSlot, attackerInstanceId: attackerInst.instanceId };
  const defenderIndex = opponentIndex(attackerPlayerIndex);
  const decideFor = (controllerIndex) => (available) => decideWindow(controllerIndex, available, windowCtx);

  await openWindow(state, attackerPlayerIndex, TRIGGER.WHILE_ATTACKING, windowCtx, decideFor(attackerPlayerIndex), resolveChoice);

  // "Attacks not affected by your opponent's player or coach effects" (e.g. Chef Luis)
  // blocks the defender's reactive windows for this specific attack.
  const attackerIsImmune = getStaticFlag(attackerInst, "attacksImmuneToOpponentEffects") === true;
  if (!attackerIsImmune) {
    // OPPONENTS_TURN is the broad "any time during my opponent's turn" window; it's also
    // offered here (in addition to its own end-of-turn checkpoint in endTurn()) so cards
    // that specifically need to react to *this* attack (e.g. Santiago Rivera negating it)
    // get a chance to, even though their trigger label isn't the narrower ON_OPPONENTS_ATTACK.
    await openWindow(state, defenderIndex, TRIGGER.OPPONENTS_TURN, windowCtx, decideFor(defenderIndex), resolveChoice);
    if (!windowCtx.cancelled) {
      await openWindow(state, defenderIndex, TRIGGER.ON_OPPONENTS_ATTACK, windowCtx, decideFor(defenderIndex), resolveChoice);
    }
    // Only relevant when the target belongs to the defender (not a teammate-targeting attack).
    if (!windowCtx.cancelled && windowCtx.targetPlayerIndex === defenderIndex) {
      await openWindow(state, defenderIndex, TRIGGER.SACRIFICE, windowCtx, decideFor(defenderIndex), resolveChoice);
    }
  }

  if (windowCtx.cancelled) {
    log(state, { type: "ATTACK_NEGATED", attackerPlayerIndex, attackerInstanceId: attackerInst.instanceId });
    attackerInst.hasAttackedThisTurn = true;
    state.turnFlags.attackedThisGameByInstance[attackerInst.instanceId] = true;
    return { ok: true, negated: true };
  }

  const result = await declareAttack(
    state,
    {
      attackerPlayerIndex,
      attackerSlot,
      targetPlayerIndex: windowCtx.targetPlayerIndex,
      targetSlot: windowCtx.targetSlot,
    },
    { suppressScoreDrawOnZeroHealth: !!windowCtx.suppressScoreDrawOnZeroHealth, resolveChoice }
  );

  processPendingRestores(state);
  await processPendingPostAttackHooks(state, result, resolveChoice);

  return result;
}

/** See effectContext.js's schedulePostAttackHook doc comment. */
async function processPendingPostAttackHooks(state, attackResult, resolveChoice) {
  if (!state.pendingPostAttackHooks.length) return;
  const hooks = state.pendingPostAttackHooks;
  state.pendingPostAttackHooks = [];
  for (const hook of hooks) {
    if (hook.type === "BOTTOM_DECK_IF_DISCARDED" && attackResult.discardedInstead) {
      const opponent = opponentIndex(hook.controllerIndex);
      const options = state.players[opponent].playerSlots.filter((s) => s).map((s) => s.instanceId);
      if (!options.length) continue;
      const targetInstanceId = options.length === 1 ? options[0] : await resolveChoice({ type: "CHOOSE_OPPONENT_PLAYER", prompt: "Send which opponent player to the bottom of their deck?", options });
      const found = state.players[opponent].playerSlots.findIndex((s) => s && s.instanceId === targetInstanceId);
      if (found !== -1) moveFieldInstanceToBottomOfDeck(state, opponent, found);
    }
  }
}

/** Undo "Health lost as a result of this event" for anything that survived the attack it was cast on. */
function processPendingRestores(state) {
  if (!state.pendingRestores.length) return;
  for (const { instanceId, amount } of state.pendingRestores) {
    for (const player of state.players) {
      const inst = player.playerSlots.find((s) => s && s.instanceId === instanceId);
      if (!inst) continue; // KOed - restoration does not apply
      const maxHealth = getCard(inst.cardId).health;
      inst.currentHealth = Math.min(maxHealth, inst.currentHealth + amount);
    }
  }
  state.pendingRestores = [];
}

export function attachPsUpAction(state, playerIndex, psUpId, targetInstanceId) {
  const player = state.players[playerIndex];
  const target = player.playerSlots.find((s) => s && s.instanceId === targetInstanceId);
  // "PLAYERSCORE UP! cards cannot be attached to Star Players unless an effect
  // dictates otherwise" (e.g. Joao's "You may attach PLAYERSCORE UP! cards to this player").
  if (target && target.isStarPlayer && getStaticFlag(target, "allowsNormalPsUpAttachment") !== true) {
    return { ok: false, reason: "CANNOT_ATTACH_TO_STAR_PLAYER" };
  }
  const psUp = player.psField.find((p) => p.id === psUpId);
  if (!psUp || !psUp.isActive || psUp.attachedTo) return { ok: false, reason: "PS_UP_UNAVAILABLE" };
  psUp.attachedTo = targetInstanceId;
  target.attachedPsUp.push(psUpId);
  log(state, { type: "ATTACH_PS_UP", playerIndex, psUpId, targetInstanceId });
  return { ok: true };
}

export async function activateEffectAction(state, playerIndex, source, triggerType, windowCtx, resolveChoice) {
  const available = getActivatableSources(state, playerIndex, triggerType, windowCtx);
  const match = available.find(
    (s) =>
      s.cardId === source.cardId &&
      s.zone === source.zone &&
      s.label === source.label &&
      (s.zone === "HAND" ? s.handIndex === source.handIndex : s.instanceId === source.instanceId)
  );
  if (!match) return { ok: false, reason: "NOT_ACTIVATABLE" };
  await activateSource(state, playerIndex, match, windowCtx, resolveChoice);
  return { ok: true };
}

export async function endTurn(state, playerIndex, resolveChoice, decideWindow = defaultDecideWindow) {
  const windowCtx = { playerIndex };
  const defenderIndex = opponentIndex(playerIndex);
  await openWindow(state, defenderIndex, TRIGGER.OPPONENTS_TURN, windowCtx, (available) => decideWindow(defenderIndex, available, windowCtx), resolveChoice);
  endTurnPhase(state);
}
