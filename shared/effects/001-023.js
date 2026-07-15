import { registerEffect } from "../engine/effectRegistry.js";
import { TRIGGER } from "../engine/constants.js";

// Coach Rares (Head Coach): "Attach 1 rested PLAYERSCORE UP! to a player on your field."
function restedPsUpOptions(ctx) {
  return ctx.player().psField.filter((p) => !p.isActive && !p.attachedTo);
}

registerEffect("001-023", {
  trigger: TRIGGER.YOUR_TURN,
  canActivate(ctx) {
    return restedPsUpOptions(ctx).length > 0 && ctx.player().playerSlots.some((s) => s);
  },
  *resolve(ctx) {
    const psUpOptions = restedPsUpOptions(ctx).map((p) => p.id);
    const psUpId = psUpOptions.length === 1 ? psUpOptions[0] : yield { type: "CHOOSE_PS_UP", prompt: "Attach which rested PLAYERSCORE UP!?", options: psUpOptions };
    const playerOptions = ctx.player().playerSlots.filter((s) => s).map((s) => s.instanceId);
    const targetInstanceId = playerOptions.length === 1 ? playerOptions[0] : yield { type: "CHOOSE_OWN_PLAYER", prompt: "Attach it to which player?", options: playerOptions };
    ctx.attachPsUpForced(ctx.self, psUpId, targetInstanceId);
  },
});
