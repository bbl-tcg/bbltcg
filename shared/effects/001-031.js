import { registerEffect } from "../engine/effectRegistry.js";
import { TRIGGER } from "../engine/constants.js";

function findSimonChapman(ctx) {
  return ctx.player().playerSlots.find((s) => s && ctx.card(s.cardId).name === "Simon Chapman");
}
function restedPsUpOptions(ctx) {
  return ctx.player().psField.filter((p) => !p.isActive && !p.attachedTo);
}

// Coach Blossom (Head Coach): "If you have a Simon Chapman on your field, you may attach
// 1 rested PLAYERSCORE UP! to it."
registerEffect("001-031", {
  trigger: TRIGGER.YOUR_TURN,
  canActivate(ctx) {
    return !!findSimonChapman(ctx) && restedPsUpOptions(ctx).length > 0;
  },
  *resolve(ctx) {
    const simon = findSimonChapman(ctx);
    // PLAYERSCORE UP! cards are fungible - no need to ask which rested one to use.
    const psUpId = restedPsUpOptions(ctx)[0].id;
    ctx.attachPsUpForced(ctx.self, psUpId, simon.instanceId);
  },
});
