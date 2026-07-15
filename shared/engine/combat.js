import { log } from "./state.js";
import { effectiveAttack, effectiveSpeed, speedTriangleBonus, canAttack } from "./stats.js";
import { moveFieldInstanceToDiscard } from "./primitives.js";

/**
 * Resolve an attack. `targetPlayerIndex` may equal `attackerPlayerIndex` for the rare
 * teammate-targeting effects (e.g. Ricky Covey Jr.) — callers are responsible for only
 * allowing that when the attacking card's effect explicitly permits it.
 */
export function declareAttack(
  state,
  { attackerPlayerIndex, attackerSlot, targetPlayerIndex, targetSlot },
  { isFirstTurnOfGameForActor = false, suppressScoreDrawOnZeroHealth = false } = {}
) {
  const attackerPlayer = state.players[attackerPlayerIndex];
  const targetPlayer = state.players[targetPlayerIndex];
  const attacker = attackerPlayer.playerSlots[attackerSlot];
  const target = targetPlayer.playerSlots[targetSlot];
  if (!attacker || !target) return { ok: false, reason: "MISSING_COMBATANT" };
  if (!canAttack(state, attackerPlayerIndex, attacker, isFirstTurnOfGameForActor)) {
    return { ok: false, reason: "CANNOT_ATTACK" };
  }

  const attackerSpeed = effectiveSpeed(attacker);
  const targetSpeed = effectiveSpeed(target);
  const baseDamage = effectiveAttack(state, attackerPlayerIndex, attacker);
  const bonus = speedTriangleBonus(attackerSpeed, targetSpeed);
  const damage = baseDamage + bonus;

  target.currentHealth -= damage;

  if (attacker.hasAttackedThisTurn) {
    attacker.extraAttacksGrantedThisTurn = Math.max(0, attacker.extraAttacksGrantedThisTurn - 1);
  }
  attacker.hasAttackedThisTurn = true;
  state.turnFlags.attackedThisGameByInstance[attacker.instanceId] = true;
  attacker.lastAttack = { targetPlayerIndex, targetInstanceId: target.instanceId, turnNumber: state.turnNumber };

  log(state, {
    type: "ATTACK",
    attackerPlayerIndex,
    attackerInstanceId: attacker.instanceId,
    targetPlayerIndex,
    targetInstanceId: target.instanceId,
    damage,
    speedBonus: bonus,
  });

  const zeroHealth = target.currentHealth <= 0;
  if (zeroHealth) {
    // Ricky Covey Jr.'s GREATER GOOD star power: "it is discarded instead of KOed" - no
    // Score draw for the defender when this specific attack's zero-health rule is overridden.
    moveFieldInstanceToDiscard(state, targetPlayerIndex, targetSlot, { koed: !suppressScoreDrawOnZeroHealth });
  }

  return { ok: true, damage, koed: zeroHealth && !suppressScoreDrawOnZeroHealth, discardedInstead: zeroHealth && suppressScoreDrawOnZeroHealth };
}

export function dealDamage(state, { targetPlayerIndex, targetSlot, amount, source }) {
  const targetPlayer = state.players[targetPlayerIndex];
  const target = targetPlayer.playerSlots[targetSlot];
  if (!target) return { ok: false };
  target.currentHealth -= amount;
  log(state, { type: "DAMAGE", targetPlayerIndex, targetInstanceId: target.instanceId, amount, source });
  const koed = target.currentHealth <= 0;
  if (koed) {
    moveFieldInstanceToDiscard(state, targetPlayerIndex, targetSlot, { koed: true });
  }
  return { ok: true, koed };
}
