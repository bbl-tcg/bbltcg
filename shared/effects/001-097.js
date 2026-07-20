import { registerEffect } from "../engine/effectRegistry.js";
import { TRIGGER } from "../engine/constants.js";

// Save (Event): "Give one of your players +2 Health until your opponent's End Phase."
registerEffect("001-097", {
  trigger: TRIGGER.ON_OPPONENTS_ATTACK,
  canActivate(ctx) {
    return ctx.player().playerSlots.some((s) => s);
  },
  *resolve(ctx) {
    const options = ctx.player().playerSlots.filter((s) => s).map((s) => s.instanceId);
    const targetInstanceId = yield {
      type: "CHOOSE_OWN_PLAYER",
      prompt: "Give +2 Health to which player?",
      options,
      allowNone: true,
      cancelLabel: "Don't use this",
    };
    if (!targetInstanceId) return ctx.cancelEventAndRefund();
    ctx.healCurrent(targetInstanceId, 2);
  },
});
