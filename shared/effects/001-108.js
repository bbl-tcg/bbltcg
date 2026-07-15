import { registerEffect } from "../engine/effectRegistry.js";
import { TRIGGER } from "../engine/constants.js";

// YURRRRRR (Event, YOUR_TURN): "A STAR Player on your field gains +2 Attack until your
// End Phase."
registerEffect("001-108", {
  trigger: TRIGGER.YOUR_TURN,
  canActivate(ctx) {
    return ctx.player().playerSlots.some((s) => s && s.isStarPlayer);
  },
  *resolve(ctx) {
    const options = ctx.player().playerSlots.filter((s) => s && s.isStarPlayer).map((s) => s.instanceId);
    const targetInstanceId = options.length === 1 ? options[0] : yield { type: "CHOOSE_OWN_PLAYER", prompt: "Give +2 Attack to which Star Player?", options };
    ctx.addBuff(targetInstanceId, { source: "001-108", attack: 2, expires: { endOfTurn: ctx.state.turnNumber } });
  },
});
