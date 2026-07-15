import { registerEffect } from "../engine/effectRegistry.js";
import { TRIGGER } from "../engine/constants.js";

// Coach JC (Head Coach): "If a Chris P. Bacon player is on your field, discard it and
// draw 2 cards from your deck."
function findChrisPBacon(ctx) {
  return ctx.player().playerSlots.find((s) => s && ctx.card(s.cardId).name === "Chris P. Bacon");
}

registerEffect("001-071", {
  trigger: TRIGGER.YOUR_TURN,
  canActivate(ctx) {
    return !!findChrisPBacon(ctx);
  },
  *resolve(ctx) {
    const inst = findChrisPBacon(ctx);
    const slot = ctx.player().playerSlots.findIndex((s) => s === inst);
    ctx.discardFieldSlot(ctx.self, slot);
    ctx.draw(ctx.self, 2);
  },
});
