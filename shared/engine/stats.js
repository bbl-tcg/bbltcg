import { getCard } from "./cardDb.js";
import { getEffect } from "./effectRegistry.js";
import { SPEED_BEATS } from "./constants.js";
import { opponentIndex } from "./state.js";

/** "The chosen player has no effect until your End Phase" (Kimi Raikonnen) and similar. */
export function isSilenced(instance) {
  return instance.buffs.some((b) => b.silenced);
}

function staticHooksFor(instance) {
  if (isSilenced(instance)) return [];
  const def = getEffect(instance.cardId);
  if (!def) return [];
  const candidates = def.main ? [def.main, def.starPower] : [def];
  return candidates.filter((d) => d && d.trigger === null && d.staticEffect);
}

/** Read a boolean/value flag off any static effect a card instance carries (e.g. immunity flags other effects consult). */
export function getStaticFlag(instance, flagName) {
  for (const hook of staticHooksFor(instance)) {
    if (flagName in hook.staticEffect) return hook.staticEffect[flagName];
  }
  return undefined;
}

function hookCtx(state, playerIndex, instance, card) {
  // Same shape/naming convention as effectContext.js's ctx (`card` is a lookup function,
  // not "this instance's own card") so conditionFn()s can be shared between the two.
  return {
    state,
    playerIndex,
    self: playerIndex,
    opponent: opponentIndex(playerIndex),
    instance,
    ownCard: card,
    card: getCard,
    player: (i = playerIndex) => state.players[i],
  };
}

function teamStaticHooks(state, playerIndex) {
  const player = state.players[playerIndex];
  const sources = [player.headCoach.cardId, player.assistantCoach?.cardId].filter(Boolean);
  const hooks = [];
  for (const cardId of sources) {
    const def = getEffect(cardId);
    if (!def) continue;
    if (def.trigger === null && def.staticEffect) hooks.push(def.staticEffect);
  }
  return hooks;
}

export function effectiveAttack(state, playerIndex, instance) {
  const card = getCard(instance.cardId);
  let attack = card.attack + instance.attachedPsUp.length; // +1 attack per attached PLAYERSCORE UP!
  attack += instance.buffs.reduce((sum, b) => sum + (b.attack || 0), 0);

  const ctx = hookCtx(state, playerIndex, instance, card);
  for (const hook of staticHooksFor(instance)) {
    if (hook.staticEffect.modifyOwnAttack) {
      attack = hook.staticEffect.modifyOwnAttack(ctx, attack);
    }
  }
  // Team-wide static boosts from the controller's Head Coach / Assistant Coach (e.g.
  // Coach Stark: "Every player on your field gains +1 Attack") - a silenced *player*
  // loses its own printed effect, but that doesn't block buffs coming from elsewhere.
  for (const staticEffect of teamStaticHooks(state, playerIndex)) {
    if (staticEffect.modifyAllOwnAttack) attack = staticEffect.modifyAllOwnAttack(ctx, attack);
  }
  return Math.max(0, attack);
}

export function effectiveHealth(instance) {
  return instance.currentHealth;
}

export function effectiveMaxHealth(state, playerIndex, instance) {
  const card = getCard(instance.cardId);
  let health = card.health;
  health += instance.buffs.filter((b) => b.expires === "permanent").reduce((sum, b) => sum + (b.health || 0), 0);

  const ctx = hookCtx(state, playerIndex, instance, card);
  for (const hook of staticHooksFor(instance)) {
    if (hook.staticEffect.modifyOwnMaxHealth) {
      health = hook.staticEffect.modifyOwnMaxHealth(ctx, health);
    }
  }
  return health;
}

export function effectiveSpeed(instance) {
  const card = getCard(instance.cardId);
  const override = instance.buffs.find((b) => b.speedOverride)?.speedOverride;
  return override || card.speed;
}

/** Cost as modified by temporary "-N Cost" style buffs. Only matters for effects that key
 * off "a player with a Cost of X or less" as a targeting filter - cost has no meaning for a
 * card once it's already on the field otherwise. */
export function effectiveCost(instance) {
  const card = getCard(instance.cardId);
  const delta = instance.buffs.reduce((sum, b) => sum + (b.cost || 0), 0);
  return card.cost + delta;
}

/** Cost to actually play a card still sitting in hand, as modified by temporary "+/-N
 * Cost" effects like Dr. Doof's "all players... in your hand have +1 Cost," and by
 * standing Assistant Coach effects like Coach Alex's "-1 Cost when you play them." Both
 * only apply to Player/Star Player cards (not Events/Assistant Coaches), hence needing to
 * know the card being played rather than just its base cost. */
export function effectiveHandCost(state, playerIndex, card) {
  let cost = card.cost;
  const isPlayerish = card.type === "Player" || card.type === "StarPlayer";
  if (isPlayerish) {
    cost += state.handCostModifiers.filter((m) => m.playerIndex === playerIndex).reduce((sum, m) => sum + m.delta, 0);
    for (const staticEffect of teamStaticHooks(state, playerIndex)) {
      if (staticEffect.modifyHandCost) cost = staticEffect.modifyHandCost({ state, playerIndex, card }, cost);
    }
  }
  return Math.max(0, cost);
}

// A "cannot attack" buff's removal timing is entirely handled by the normal buff-expiry
// sweep (turn.js), so being present in the array at all means it's still in effect.
export function isStunned(instance) {
  return instance.buffs.some((b) => b.cannotAttack);
}

/** +1 damage if attackerSpeed beats defenderSpeed on the Fast > Midspeed > Slow > Fast cycle. */
export function speedTriangleBonus(attackerSpeed, defenderSpeed) {
  return SPEED_BEATS[attackerSpeed] === defenderSpeed ? 1 : 0;
}

export function isStarPlayerInPowerUpTurns(instance, currentTurnNumber) {
  if (!instance.isStarPlayer) return false;
  // "Power Up Turns" = the turn played and the turn immediately after.
  return currentTurnNumber === instance.turnPlayed || currentTurnNumber === instance.turnPlayed + 1;
}

export function canAttack(state, playerIndex, instance, isFirstTurnOfGameForActor) {
  if (isFirstTurnOfGameForActor) return false;
  if (instance.hasAttackedThisTurn && instance.extraAttacksGrantedThisTurn <= 0) return false;
  if (isStarPlayerInPowerUpTurns(instance, state.turnNumber)) return false;
  if (isStunned(instance)) return false;
  return true;
}
