import { registerEffect } from "../engine/effectRegistry.js";
import { TRIGGER } from "../engine/constants.js";

// Stun (Event): "Give one of your opponent's players -2 Health during one of your players'
// attack. If the chosen opponent player is not KOed from this attack, it regains any Health
// lost as a result of this event."
registerEffect("001-099", {
  trigger: TRIGGER.WHILE_ATTACKING,
  canActivate(ctx) {
    return ctx.state.players[ctx.opponent].playerSlots.some((s) => s);
  },
  *resolve(ctx) {
    const options = ctx.state.players[ctx.opponent].playerSlots.filter((s) => s).map((s) => s.instanceId);
    const targetInstanceId = yield { type: "CHOOSE_OPPONENT_PLAYER", prompt: "Give -2 Health to which opposing player?", options };
    ctx.healCurrent(targetInstanceId, -2);
    ctx.scheduleRestoreIfSurvives(targetInstanceId, 2);
  },
});
