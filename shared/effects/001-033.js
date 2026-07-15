import { registerEffect } from "../engine/effectRegistry.js";
import { TRIGGER } from "../engine/constants.js";
import { effectiveCost } from "../engine/stats.js";
import { chooseOpponentPlayerTarget } from "./_helpers.js";

// Kevin Nguyen (Player, WHILE_ATTACKING): "Choose 1 of your opponent's players with a
// Cost of 0 or less. Your opponent may discard it, and both you and your opponent draw
// 1 card."
function lowCostOpponentSlots(ctx) {
  return ctx
    .player(ctx.opponent)
    .playerSlots.map((s, slot) => ({ s, slot }))
    .filter(({ s }) => s && effectiveCost(s) <= 0);
}

registerEffect("001-033", {
  trigger: TRIGGER.WHILE_ATTACKING,
  canActivate(ctx) {
    return lowCostOpponentSlots(ctx).length > 0;
  },
  *resolve(ctx) {
    const targets = lowCostOpponentSlots(ctx);
    const chosenInstanceId = yield* chooseOpponentPlayerTarget(ctx, {
      prompt: "Choose 1 opponent player with Cost 0 or less",
      eligible: targets.map((t) => t.s),
    });
    const slot = ctx.player(ctx.opponent).playerSlots.findIndex((s) => s && s.instanceId === chosenInstanceId);

    const wantsDiscard = yield { type: "CHOOSE_YES_NO", forPlayer: ctx.opponent, prompt: "Discard this player? (both players then draw 1 card)" };
    if (wantsDiscard) {
      ctx.discardFieldSlot(ctx.opponent, slot);
      ctx.draw(ctx.self, 1);
      ctx.draw(ctx.opponent, 1);
    }
  },
});
