import { registerEffect } from "../engine/effectRegistry.js";
import { TRIGGER } from "../engine/constants.js";
import { effectiveCost } from "../engine/stats.js";

// Coach Times (Assistant Coach, ON_PLAY): "If you have 3 players with a Cost of 8 or
// more on your field, add 1 Event from your hand to your Score."
function eventOptions(ctx) {
  return ctx.player().hand.filter((cardId) => ctx.card(cardId).type === "Event");
}

registerEffect("001-072", {
  trigger: TRIGGER.ON_PLAY,
  canActivate(ctx) {
    const highCostCount = ctx.player().playerSlots.filter((s) => s && effectiveCost(s) >= 8).length;
    return highCostCount >= 3 && eventOptions(ctx).length > 0;
  },
  *resolve(ctx) {
    const options = eventOptions(ctx);
    const cardId = options.length === 1 ? options[0] : yield { type: "CHOOSE_HAND_CARD_BY_ID", prompt: "Add which Event from your hand to your Score?", options };
    ctx.addHandCardToScore(ctx.self, cardId);
  },
});
