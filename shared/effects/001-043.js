import { registerEffect } from "../engine/effectRegistry.js";
import { TRIGGER } from "../engine/constants.js";

// Kimi Raikonnen (Player, YOUR_TURN): "Choose one of the players on your field. The
// chosen player has no effect until your End Phase."
registerEffect("001-043", {
  trigger: TRIGGER.YOUR_TURN,
  canActivate(ctx) {
    return ctx.player().playerSlots.some((s) => s);
  },
  *resolve(ctx) {
    const options = ctx.player().playerSlots.filter((s) => s).map((s) => s.instanceId);
    const targetInstanceId = options.length === 1 ? options[0] : yield { type: "CHOOSE_OWN_PLAYER", prompt: "Silence which of your own players until your End Phase?", options };
    ctx.addBuff(targetInstanceId, { source: "001-043", silenced: true, expires: { endOfTurn: ctx.state.turnNumber } });
  },
});
