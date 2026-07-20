import { registerEffect } from "../engine/effectRegistry.js";
import { TRIGGER } from "../engine/constants.js";

// Look out Ragnar... This is Mushu's Day!!! (Event, ON_OPPONENTS_ATTACK): "Choose one of
// the players on your field that is not a STAR PLAYER. This player gains +3 Health until
// your opponent's End Phase."
registerEffect("001-113", {
  trigger: TRIGGER.ON_OPPONENTS_ATTACK,
  canActivate(ctx) {
    return ctx.player().playerSlots.some((s) => s && !s.isStarPlayer);
  },
  *resolve(ctx) {
    const options = ctx.player().playerSlots.filter((s) => s && !s.isStarPlayer).map((s) => s.instanceId);
    const targetInstanceId =
      options.length === 1
        ? options[0]
        : yield {
            type: "CHOOSE_OWN_PLAYER",
            prompt: "Give +3 Health to which non-Star player?",
            options,
            allowNone: true,
            cancelLabel: "Don't use this",
          };
    if (!targetInstanceId) return ctx.cancelEventAndRefund();
    ctx.healCurrent(targetInstanceId, 3);
  },
});
