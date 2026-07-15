import { registerEffect } from "../engine/effectRegistry.js";
import { TRIGGER } from "../engine/constants.js";
import { chooseOpponentPlayerTarget } from "./_helpers.js";

// Cyclops (Player, ON_KO): "Inflict the same amount of damage as the last attack used on
// this Cyclops to one of the players on your opponent's field."
registerEffect("001-058", {
  trigger: TRIGGER.ON_KO,
  canActivate(ctx) {
    const self = ctx.findInstance(ctx.source.instanceId);
    return !!self && self.instance.lastDamageTaken > 0 && ctx.player(ctx.opponent).playerSlots.some((s) => s);
  },
  *resolve(ctx) {
    const self = ctx.findInstance(ctx.source.instanceId);
    const amount = self.instance.lastDamageTaken;
    const eligible = ctx.player(ctx.opponent).playerSlots.filter((s) => s);
    const targetInstanceId = yield* chooseOpponentPlayerTarget(ctx, { prompt: "Reflect the damage onto which opponent player?", eligible });
    const slot = ctx.player(ctx.opponent).playerSlots.findIndex((s) => s && s.instanceId === targetInstanceId);
    if (slot !== -1) ctx.dealDamage(ctx.opponent, slot, amount);
  },
});
