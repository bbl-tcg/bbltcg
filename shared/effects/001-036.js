import { registerEffect } from "../engine/effectRegistry.js";
import { TRIGGER } from "../engine/constants.js";
import { effectiveCost } from "../engine/stats.js";
import { chooseOpponentPlayerTarget, isFieldProtectedFromOpponentEffects } from "./_helpers.js";

// King Scar (Player, ON_PLAY): "Choose 1 of the players on your opponent's field with a
// Cost of 1 or less. Your opponent must put this player at the bottom of their deck."
function lowCostOpponentSlots(ctx) {
  return ctx
    .player(ctx.opponent)
    .playerSlots.map((s, slot) => ({ s, slot }))
    .filter(({ s }) => s && effectiveCost(s) <= 1);
}

registerEffect("001-036", {
  trigger: TRIGGER.ON_PLAY,
  canActivate(ctx) {
    if (isFieldProtectedFromOpponentEffects(ctx, ctx.opponent)) return false;
    return lowCostOpponentSlots(ctx).length > 0;
  },
  *resolve(ctx) {
    const targets = lowCostOpponentSlots(ctx);
    const chosenInstanceId = yield* chooseOpponentPlayerTarget(ctx, {
      prompt: "Choose 1 opponent player with Cost 1 or less",
      eligible: targets.map((t) => t.s),
    });
    const slot = ctx.player(ctx.opponent).playerSlots.findIndex((s) => s && s.instanceId === chosenInstanceId);
    if (slot !== -1) ctx.bottomDeckFieldSlot(ctx.opponent, slot);
  },
});
