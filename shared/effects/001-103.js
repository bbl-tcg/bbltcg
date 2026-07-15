import { registerEffect } from "../engine/effectRegistry.js";
import { TRIGGER } from "../engine/constants.js";

// Mysterious Commissioner Plot Armor (Event, ON_OPPONENTS_ATTACK): "A player on your
// field gains +1 Health that lasts until the player is removed from the field. This
// event cannot be used on a STAR Player."
registerEffect("001-103", {
  trigger: TRIGGER.ON_OPPONENTS_ATTACK,
  canActivate(ctx) {
    return ctx.player().playerSlots.some((s) => s && !s.isStarPlayer);
  },
  *resolve(ctx) {
    const options = ctx.player().playerSlots.filter((s) => s && !s.isStarPlayer).map((s) => s.instanceId);
    const targetInstanceId = options.length === 1 ? options[0] : yield { type: "CHOOSE_OWN_PLAYER", prompt: "Give +1 permanent Health to which player?", options };
    ctx.addBuff(targetInstanceId, { source: "001-103", health: 1, expires: "permanent" });
    ctx.healCurrent(targetInstanceId, 1);
  },
});
