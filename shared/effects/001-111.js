import { registerEffect } from "../engine/effectRegistry.js";
import { TRIGGER } from "../engine/constants.js";
import { redirectAttackEffect } from "./_helpers.js";

// 7 Saves in 1 Game by... Xander Diamond??? (Event, YOUR_TURN): "Choose one of the
// players on your field. This player gains [SACRIFICE] until your opponent's End Phase."
registerEffect("001-111", {
  trigger: TRIGGER.YOUR_TURN,
  canActivate(ctx) {
    return ctx.player().playerSlots.some((s) => s);
  },
  *resolve(ctx) {
    const options = ctx.player().playerSlots.filter((s) => s).map((s) => s.instanceId);
    const targetInstanceId = options.length === 1 ? options[0] : yield { type: "CHOOSE_OWN_PLAYER", prompt: "Give [SACRIFICE] to which player?", options };
    // Played on my own turn, so "your opponent's End Phase" is the very next turn's end.
    ctx.grantEffect(targetInstanceId, redirectAttackEffect(), { endOfTurn: ctx.state.turnNumber + 1 });
  },
});
