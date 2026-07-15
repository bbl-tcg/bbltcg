import { registerEffect } from "../engine/effectRegistry.js";
import { TRIGGER } from "../engine/constants.js";

// Jake Bullet (Player, OPPONENTS_TURN): "If your opponent is attacking with a STAR
// Player, negate the attacking player's effects until your opponent's End Phase."
registerEffect("001-049", {
  trigger: TRIGGER.OPPONENTS_TURN,
  canActivate(ctx, windowCtx) {
    if (!windowCtx || !windowCtx.attackerInstanceId) return false;
    const attacker = ctx.player(ctx.opponent).playerSlots.find((s) => s && s.instanceId === windowCtx.attackerInstanceId);
    return !!attacker && attacker.isStarPlayer;
  },
  *resolve(ctx, windowCtx) {
    ctx.addBuff(windowCtx.attackerInstanceId, { source: "001-049", silenced: true, expires: { endOfTurn: ctx.state.turnNumber } });
  },
});
