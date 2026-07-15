import { registerEffect } from "../engine/effectRegistry.js";
import { TRIGGER } from "../engine/constants.js";

// Gragas (Player, ON_PLAY): "Choose 1 of the players on your opponent's field. This
// player cannot attack until your opponent's next End Phase."
registerEffect("001-037", {
  trigger: TRIGGER.ON_PLAY,
  canActivate(ctx) {
    return ctx.player(ctx.opponent).playerSlots.some((s) => s);
  },
  *resolve(ctx) {
    const options = ctx.player(ctx.opponent).playerSlots.filter((s) => s).map((s) => s.instanceId);
    const targetInstanceId = options.length === 1 ? options[0] : yield { type: "CHOOSE_OPPONENT_PLAYER", prompt: "Choose 1 opponent player to stop from attacking", options };
    // Played during my own turn, so "your opponent's next End Phase" is the very next turn.
    ctx.addBuff(targetInstanceId, { source: "001-037", cannotAttack: true, expires: { endOfTurn: ctx.state.turnNumber + 1 } });
  },
});
