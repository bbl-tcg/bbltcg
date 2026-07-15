import { registerEffect } from "../engine/effectRegistry.js";
import { TRIGGER } from "../engine/constants.js";
import { effectiveAttack, effectiveSpeed, speedTriangleBonus } from "../engine/stats.js";

// Saved... Just In Time!!! (Event, ON_OPPONENTS_ATTACK): "If a player on your field is
// about to be KOed from an attack, choose another player on your field and discard, not
// KO, that player instead."
function wouldBeKoed(ctx, windowCtx) {
  const attacker = ctx.player(windowCtx.attackerPlayerIndex).playerSlots[windowCtx.attackerSlot];
  const target = ctx.player().playerSlots[windowCtx.targetSlot];
  if (!attacker || !target) return false;
  const damage = effectiveAttack(ctx.state, windowCtx.attackerPlayerIndex, attacker) + speedTriangleBonus(effectiveSpeed(attacker), effectiveSpeed(target));
  return target.currentHealth <= damage;
}

registerEffect("001-102", {
  trigger: TRIGGER.ON_OPPONENTS_ATTACK,
  canActivate(ctx, windowCtx) {
    if (!windowCtx || windowCtx.targetPlayerIndex !== ctx.self) return false;
    if (!wouldBeKoed(ctx, windowCtx)) return false;
    return ctx.player().playerSlots.some((s, slot) => s && slot !== windowCtx.targetSlot);
  },
  *resolve(ctx, windowCtx) {
    const options = ctx
      .player()
      .playerSlots.map((s, slot) => ({ s, slot }))
      .filter((e) => e.s && e.slot !== windowCtx.targetSlot);
    const chosen = options.length === 1 ? options[0] : yield { type: "CHOOSE_OWN_PLAYER", prompt: "Discard which other player instead?", options: options.map((e) => e.s.instanceId) };
    const slot = options.length === 1 ? chosen.slot : ctx.player().playerSlots.findIndex((s) => s && s.instanceId === chosen);
    windowCtx.cancelled = true;
    ctx.discardFieldSlot(ctx.self, slot);
  },
});
