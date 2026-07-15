import { registerEffect } from "../engine/effectRegistry.js";
import { TRIGGER } from "../engine/constants.js";

// Franklin Atkins (Player, YOUR_TURN): "Until your End Phase, all the players on your
// opponent's field have -1 Cost."
registerEffect("001-034", {
  trigger: TRIGGER.YOUR_TURN,
  canActivate(ctx) {
    return ctx.player(ctx.opponent).playerSlots.some((s) => s);
  },
  *resolve(ctx) {
    for (const s of ctx.player(ctx.opponent).playerSlots) {
      if (s) ctx.addBuff(s.instanceId, { source: "001-034", cost: -1, expires: { endOfTurn: ctx.state.turnNumber } });
    }
  },
});
