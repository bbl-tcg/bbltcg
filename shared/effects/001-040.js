import { registerEffect } from "../engine/effectRegistry.js";
import { TRIGGER } from "../engine/constants.js";

// Coach May Fanpage (Assistant Coach, OPPONENTS_TURN): "Until your opponent's End Phase,
// all the players on their field have -1 Cost."
registerEffect("001-040", {
  trigger: TRIGGER.OPPONENTS_TURN,
  canActivate(ctx) {
    return ctx.player(ctx.opponent).playerSlots.some((s) => s);
  },
  *resolve(ctx) {
    for (const s of ctx.player(ctx.opponent).playerSlots) {
      if (s) ctx.addBuff(s.instanceId, { source: "001-040", cost: -1, expires: { endOfTurn: ctx.state.turnNumber } });
    }
  },
});
