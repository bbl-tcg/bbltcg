import { registerEffect } from "../engine/effectRegistry.js";
import { TRIGGER } from "../engine/constants.js";

// Himmy Neutron (Player, YOUR_TURN): "If this Himmy Neutron has already attacked this
// turn, you may discard this card from your field. If you do, inflict 2 more damage onto
// the player you attacked with this Himmy Neutron."
function lastAttackTargetSlot(ctx) {
  const self = ctx.findInstance(ctx.source.instanceId);
  const lastAttack = self?.instance.lastAttack;
  if (!lastAttack || lastAttack.turnNumber !== ctx.state.turnNumber) return null;
  const targetPlayer = ctx.player(lastAttack.targetPlayerIndex);
  const slot = targetPlayer.playerSlots.findIndex((s) => s && s.instanceId === lastAttack.targetInstanceId);
  return slot === -1 ? null : { targetPlayerIndex: lastAttack.targetPlayerIndex, slot };
}

registerEffect("001-052", {
  trigger: TRIGGER.YOUR_TURN,
  canActivate(ctx) {
    const self = ctx.findInstance(ctx.source.instanceId);
    return !!self?.instance.hasAttackedThisTurn && !!lastAttackTargetSlot(ctx);
  },
  *resolve(ctx) {
    const target = lastAttackTargetSlot(ctx);
    ctx.discardFieldSlot(ctx.self, ctx.source.slot);
    if (target) ctx.dealDamage(target.targetPlayerIndex, target.slot, 2);
  },
});
