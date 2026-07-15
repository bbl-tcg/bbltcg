import { registerEffect } from "../engine/effectRegistry.js";
import { TRIGGER } from "../engine/constants.js";

// Earl Towns (Player, WHILE_ATTACKING): "If a STAR Player on your field has already
// attacked during this turn, this Earl Towns gains +1 Attack until your End Phase."
registerEffect("001-028", {
  trigger: TRIGGER.WHILE_ATTACKING,
  canActivate(ctx) {
    return ctx.player().playerSlots.some((s) => s && s.isStarPlayer && s.hasAttackedThisTurn);
  },
  *resolve(ctx, windowCtx) {
    ctx.addBuff(windowCtx.attackerInstanceId, { source: "001-028", attack: 1, expires: { endOfTurn: ctx.state.turnNumber } });
  },
});
