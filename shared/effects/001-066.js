import { registerEffect } from "../engine/effectRegistry.js";
import { TRIGGER } from "../engine/constants.js";

// Dr. Doof (Player, YOUR_TURN): "Until your End Phase, all players on your field and in
// your hand have +1 Cost."
registerEffect("001-066", {
  trigger: TRIGGER.YOUR_TURN,
  canActivate() {
    return true;
  },
  *resolve(ctx) {
    const expires = { endOfTurn: ctx.state.turnNumber };
    for (const s of ctx.player().playerSlots) {
      if (s) ctx.addBuff(s.instanceId, { source: "001-066", cost: 1, expires });
    }
    ctx.addHandCostModifier(ctx.self, 1, expires);
  },
});
