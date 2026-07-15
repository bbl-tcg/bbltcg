import { registerEffect } from "../engine/effectRegistry.js";
import { TRIGGER } from "../engine/constants.js";
import { effectiveCost } from "../engine/stats.js";
import { chooseOpponentPlayerTarget } from "./_helpers.js";

// Coach Schmaxel Ego Death (Event, YOUR_TURN): "Choose 1 of the players on your
// opponent's field with a cost of 2 or less to send back to your opponent's hand."
function lowCostOpponentSlots(ctx) {
  return ctx
    .player(ctx.opponent)
    .playerSlots.filter((s) => s && effectiveCost(s) <= 2);
}

registerEffect("001-105", {
  trigger: TRIGGER.YOUR_TURN,
  canActivate(ctx) {
    return lowCostOpponentSlots(ctx).length > 0;
  },
  *resolve(ctx) {
    const eligible = lowCostOpponentSlots(ctx);
    const targetInstanceId = yield* chooseOpponentPlayerTarget(ctx, { prompt: "Send which opponent player back to their hand?", eligible });
    const slot = ctx.player(ctx.opponent).playerSlots.findIndex((s) => s && s.instanceId === targetInstanceId);
    if (slot !== -1) ctx.returnFieldSlotToHand(ctx.opponent, slot);
  },
});
