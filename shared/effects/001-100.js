import { registerEffect } from "../engine/effectRegistry.js";
import { TRIGGER } from "../engine/constants.js";
import { effectiveAttack } from "../engine/stats.js";

// Assist (Event, WHILE_ATTACKING): "Choose a player on your field that is not the player
// attacking. Add the chosen player's Attack value to the attacking player's Attack value
// during this attack."
registerEffect("001-100", {
  trigger: TRIGGER.WHILE_ATTACKING,
  canActivate(ctx, windowCtx) {
    return ctx.player().playerSlots.some((s) => s && s.instanceId !== windowCtx.attackerInstanceId);
  },
  *resolve(ctx, windowCtx) {
    const options = ctx.player().playerSlots.filter((s) => s && s.instanceId !== windowCtx.attackerInstanceId).map((s) => s.instanceId);
    const chosenInstanceId = options.length === 1 ? options[0] : yield { type: "CHOOSE_OWN_PLAYER", prompt: "Add which player's Attack to the attacker's Attack?", options };
    const chosen = ctx.findInstance(chosenInstanceId);
    if (!chosen) return;
    const bonus = effectiveAttack(ctx.state, ctx.self, chosen.instance);
    ctx.addBuff(windowCtx.attackerInstanceId, { source: "001-100", attack: bonus, expires: { endOfTurn: ctx.state.turnNumber } });
  },
});
